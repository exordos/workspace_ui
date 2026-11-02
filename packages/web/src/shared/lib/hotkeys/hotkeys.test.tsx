import { fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  HotkeysProvider,
  hotkeyFromEvent,
  isHotkeyBlockedByModal,
  normalizeHotkeyOverrides,
  useAppHotkey,
  useHotkeySettings,
  validateHotkeyBinding,
} from "./index";

describe("hotkey policy", () => {
  it("rejects fixed keys, native editing, unsafe browser bindings and conflicting aliases", () => {
    for (const key of [
      "Escape",
      "Shift+Tab",
      "Mod+Enter",
      "Control+C",
      "Mod+1",
      "Mod+Shift+T",
      "A",
      "Shift+A",
      "Shift++",
      "Mod++",
      "Mod+-",
      "Mod+0",
      "Mod+Shift+R",
      "[KeyC]",
    ]) {
      expect(validateHotkeyBinding("navigation.back", key, {})).not.toBeNull();
    }
    expect(validateHotkeyBinding("interface.quoteMessage", "Control+L", {})).toBeNull();
    expect(validateHotkeyBinding("interface.theme", "Control+L", {})).toBe("reserved");
    expect(validateHotkeyBinding("interface.quoteMessage", "Meta+L", {})).toBe("reserved");
    expect(validateHotkeyBinding("interface.theme", "Control+B", {})).toBe("conflict");
    expect(validateHotkeyBinding("composer.editLastMessage", "ArrowUp", {})).toBeNull();
    expect(
      normalizeHotkeyOverrides({
        "fixed.cancel": null,
        "navigation.back": "Escape",
        "navigation.forward": null,
      }),
    ).toEqual({ "navigation.forward": null });
  });
  it("restores swapped bindings without discarding either override", () => {
    const overrides = {
      "navigation.back": "Alt+ArrowRight",
      "navigation.forward": "Alt+ArrowLeft",
    };
    expect(normalizeHotkeyOverrides(overrides)).toEqual(overrides);
  });
  it("records the same letter on Russian and English layouts and ignores IME", () => {
    expect(
      hotkeyFromEvent(new KeyboardEvent("keydown", { key: "и", code: "KeyB", ctrlKey: true })),
    ).toBe("Mod+B");
    expect(
      hotkeyFromEvent(new KeyboardEvent("keydown", { key: "b", code: "KeyB", ctrlKey: true })),
    ).toBe("Mod+B");
    expect(
      hotkeyFromEvent(new KeyboardEvent("keydown", { key: "Process", isComposing: true })),
    ).toBeNull();
    expect(hotkeyFromEvent(new KeyboardEvent("keydown", { key: "b", repeat: true }))).toBeNull();
    expect(hotkeyFromEvent(new KeyboardEvent("keydown", { key: "Control" }))).toBeNull();
    expect(hotkeyFromEvent(new KeyboardEvent("keydown", { key: "b", keyCode: 229 }))).toBeNull();
  });
});

function Target({ onAction, prevent = false }: { onAction: () => void; prevent?: boolean }) {
  const target = useRef<HTMLTextAreaElement>(null);
  useAppHotkey("composer.editLastMessage", onAction, { target });
  return (
    <textarea
      aria-label="composer"
      ref={target}
      onKeyDown={(event) => {
        if (prevent) event.preventDefault();
      }}
    />
  );
}
describe("hotkey dispatch", () => {
  it("dispatches only for the focused target and respects local handlers, modal, repeat and composition", () => {
    const first = vi.fn();
    const second = vi.fn();
    render(
      <>
        <Target onAction={first} />
        <Target onAction={second} />
      </>,
    );
    const [a, b] = screen.getAllByLabelText("composer");
    fireEvent.keyDown(a!, { key: "ArrowUp", code: "ArrowUp" });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    fireEvent.keyDown(b!, { key: "ArrowUp", code: "ArrowUp", repeat: true });
    fireEvent.keyDown(b!, { key: "ArrowUp", code: "ArrowUp", isComposing: true });
    const modal = document.createElement("div");
    modal.setAttribute("role", "dialog");
    document.body.append(modal);
    fireEvent.keyDown(b!, { key: "ArrowUp", code: "ArrowUp" });
    modal.remove();
    expect(second).not.toHaveBeenCalled();
  });
  it("blocks global actions inside a modal while allowing its own target", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const target = document.createElement("textarea");
    dialog.append(target);
    document.body.append(dialog);
    expect(isHotkeyBlockedByModal()).toBe(true);
    expect(isHotkeyBlockedByModal(target)).toBe(false);
    dialog.hidden = true;
    expect(isHotkeyBlockedByModal()).toBe(false);
    dialog.remove();
  });
  it("lets the quote handler decide whether to consume Ctrl+L", () => {
    const action = vi.fn();
    function Quote() {
      useAppHotkey("interface.quoteMessage", action, { preventDefault: false });
      return <button>target</button>;
    }
    render(<Quote />);
    const event = new KeyboardEvent("keydown", {
      key: "l",
      code: "KeyL",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    expect(screen.getByText("target").dispatchEvent(event)).toBe(true);
    expect(action).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(false);
  });
  it("dispatches formatting on the Russian keyboard layout", () => {
    const action = vi.fn();
    function Composer() {
      const target = useRef<HTMLTextAreaElement>(null);
      useAppHotkey("composer.bold", action, { target });
      return <textarea aria-label="format composer" ref={target} />;
    }
    render(<Composer />);
    fireEvent.keyDown(screen.getByLabelText("format composer"), {
      key: "и",
      code: "KeyB",
      ctrlKey: true,
    });
    expect(action).toHaveBeenCalledTimes(1);
  });
  it("lets a React handler consume the key before the window listener", () => {
    const action = vi.fn();
    render(<Target onAction={action} prevent />);
    fireEvent.keyDown(screen.getByLabelText("composer"), { key: "ArrowUp", code: "ArrowUp" });
    expect(action).not.toHaveBeenCalled();
  });
  it("allows a reassignment after the other action is disabled", () => {
    const save = vi.fn(() => true);
    function Probe() {
      const settings = useHotkeySettings();
      return (
        <button
          onClick={() =>
            settings.onOverridesChange({
              "navigation.back": "Alt+ArrowRight",
              "navigation.forward": null,
            })
          }
        >
          save
        </button>
      );
    }
    render(
      <HotkeysProvider enabled overrides={{}} onEnabledChange={() => true} onOverridesChange={save}>
        <Probe />
      </HotkeysProvider>,
    );
    fireEvent.click(screen.getByText("save"));
    expect(save).toHaveBeenCalledTimes(1);
  });
  it("does not persist an invalid reset", () => {
    const save = vi.fn(() => true);
    function Probe() {
      const settings = useHotkeySettings();
      return (
        <button onClick={() => settings.onOverridesChange({ "navigation.back": "Alt+ArrowRight" })}>
          save invalid
        </button>
      );
    }
    render(
      <HotkeysProvider enabled overrides={{}} onEnabledChange={() => true} onOverridesChange={save}>
        <Probe />
      </HotkeysProvider>,
    );
    fireEvent.click(screen.getByText("save invalid"));
    expect(save).not.toHaveBeenCalled();
  });
});
