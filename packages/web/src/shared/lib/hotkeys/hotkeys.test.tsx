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
import type { HotkeyId } from "./hotkeys.lib";

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
      "Mod+=",
      "Mod+Shift+=",
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
  it("detects conflicts between shifted glyphs and physical positions on both platforms", () => {
    expect(
      validateHotkeyBinding("interface.theme", "Control+?", {
        "navigation.messenger": "Mod+Shift+/",
      }),
    ).toBe("conflict");
    expect(
      validateHotkeyBinding("interface.theme", "Meta+?", {
        "navigation.messenger": "Mod+Shift+/",
      }),
    ).toBe("conflict");
    expect(validateHotkeyBinding("interface.theme", "Control+[", {})).toBeNull();
    expect(validateHotkeyBinding("interface.theme", "Control+Shift+[Numpad3]", {})).toBeNull();
    expect(validateHotkeyBinding("interface.theme", "Control+[NumpadAdd]", {})).toBe("reserved");
  });
  it.each([
    ["и", "KeyB", false, "Mod+B"],
    ["И", "KeyB", true, "Mod+Shift+B"],
    ["b", "KeyB", false, "Mod+B"],
    ["q", "KeyA", false, "Mod+A"],
    ["х", "BracketLeft", false, "Mod+["],
    ["ж", "Semicolon", false, "Mod+;"],
    ["ё", "Backquote", false, "Mod+`"],
    [".", "Slash", false, "Mod+/"],
    [",", "Slash", true, "Mod+Shift+/"],
    ["№", "Digit3", true, "Mod+Shift+3"],
    ["&", "Digit1", false, "Mod+1"],
    [",", "NumpadDecimal", false, "Mod+[NumpadDecimal]"],
    ["3", "Numpad3", true, "Mod+Shift+[Numpad3]"],
  ])("records %s at %s with Shift=%s as %s", (key, code, shiftKey, expected) => {
    expect(
      hotkeyFromEvent(new KeyboardEvent("keydown", { key, code, ctrlKey: true, shiftKey })),
    ).toBe(expected);
  });
  it("ignores composition, repeat and modifier-only input", () => {
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
  it.each([
    ["composer.bold", null, "и", "KeyB", false, false],
    ["composer.bold", null, "q", "KeyB", false, false],
    ["composer.italic", null, "ш", "KeyI", false, false],
    ["composer.strike", null, "Ч", "KeyX", true, false],
    ["composer.code", null, "у", "KeyE", false, false],
    ["interface.quoteMessage", null, "д", "KeyL", false, false],
    ["interface.theme", "Control+Shift+K", "Л", "KeyK", true, false],
    ["interface.theme", "Meta+Shift+K", "Л", "KeyK", true, true],
    ["interface.theme", "Control+[", "х", "BracketLeft", false, false],
    ["interface.theme", "Control+Shift+3", "№", "Digit3", true, false],
    ["interface.theme", "Control+?", ",", "Slash", true, false],
    ["interface.theme", "Control+[NumpadDecimal]", ",", "NumpadDecimal", false, false],
  ] satisfies [HotkeyId, string | null, string, string, boolean, boolean][])(
    "dispatches %s (%s) by position for %s at %s",
    (id, binding, key, code, shiftKey, metaKey) => {
      const action = vi.fn();
      function Composer() {
        const target = useRef<HTMLTextAreaElement>(null);
        useAppHotkey(id, action, { target });
        return <textarea aria-label="format composer" ref={target} />;
      }
      render(
        <HotkeysProvider
          enabled
          overrides={binding == null ? {} : { [id]: binding }}
          onOverridesChange={() => true}
          onEnabledChange={() => true}
        >
          <Composer />
        </HotkeysProvider>,
      );
      const target = screen.getByLabelText("format composer");
      fireEvent.keyDown(target, { key, code: "KeyZ", ctrlKey: !metaKey, metaKey, shiftKey });
      expect(action).not.toHaveBeenCalled();
      fireEvent.keyDown(target, { key, code, ctrlKey: !metaKey, metaKey, shiftKey });
      expect(action).toHaveBeenCalledTimes(1);
    },
  );
  it("dispatches help rather than info when the Russian slash key types a period", () => {
    const help = vi.fn();
    const info = vi.fn();
    function Actions() {
      useAppHotkey("interface.help", help);
      useAppHotkey("interface.infoPanel", info);
      return <button>shortcut target</button>;
    }
    render(<Actions />);
    fireEvent.keyDown(screen.getByText("shortcut target"), {
      key: ".",
      code: "Slash",
      ctrlKey: true,
    });
    expect(help).toHaveBeenCalledOnce();
    expect(info).not.toHaveBeenCalled();
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
