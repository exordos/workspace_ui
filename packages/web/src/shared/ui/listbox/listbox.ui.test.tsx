import { fireEvent, render, screen, within } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { getListboxOptionId, moveActiveListboxOption } from "./listbox.lib";
import { Listbox } from "./listbox.ui";
import type { ListboxOption } from "./listbox.types";

const options: readonly ListboxOption[] = [
  { value: "first/value", label: "First" },
  { value: "disabled", label: "Unavailable", disabled: true },
  { value: "last value", label: "Last", description: "Last description" },
];

function Example({
  onSelect = () => {},
  onClose = () => {},
}: Readonly<{ onSelect?: (value: string) => void; onClose?: () => void }>) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <div role="dialog" aria-label="Example dialog">
        <button
          ref={anchorRef}
          role="combobox"
          aria-label="Choose"
          aria-haspopup="listbox"
          aria-expanded
          aria-controls="choices"
          aria-activedescendant={getListboxOptionId("choices", "last value")}
        >
          Choose
        </button>
        <Listbox
          id="choices"
          anchorRef={anchorRef}
          options={options}
          value="first/value"
          activeValue="last value"
          ariaLabel="Choices"
          onSelect={onSelect}
          onClose={onClose}
        />
      </div>
      <button>Outside</button>
    </>
  );
}

describe("Listbox", () => {
  it("keeps the popup in its owning dialog and exposes stable option relationships", () => {
    render(<Example />);
    const dialog = screen.getByRole("dialog", { name: "Example dialog" });
    const list = within(dialog).getByRole("listbox", { name: "Choices" });
    const activeOption = within(list).getByRole("option", { name: "Last" });
    expect(screen.getByRole("combobox", { name: "Choose" })).toHaveAttribute(
      "aria-activedescendant",
      activeOption.id,
    );
    expect(activeOption).toHaveAttribute("data-active", "true");
    expect(activeOption).toHaveAccessibleDescription("Last description");
    expect(within(list).getByRole("option", { name: "First" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("rejects disabled choices and reports an enabled choice without taking focus", () => {
    const onSelect = vi.fn();
    render(<Example onSelect={onSelect} />);
    const trigger = screen.getByRole("combobox", { name: "Choose" });
    trigger.focus();
    fireEvent.click(screen.getByRole("option", { name: "Unavailable" }));
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByRole("option", { name: "Last" }));
    fireEvent.click(screen.getByRole("option", { name: "Last" }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("last value");
    expect(trigger).toHaveFocus();
  });

  it("dismisses from outside pointer events and Escape within the owning control", () => {
    const onClose = vi.fn();
    render(<Example onClose={onClose} />);
    fireEvent.pointerDown(screen.getByRole("combobox", { name: "Choose" }));
    fireEvent.pointerDown(screen.getByRole("option", { name: "Last" }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Choose" }), {
      key: "Escape",
      isComposing: true,
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Choose" }), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("navigates only enabled choices, clamps boundaries, and handles empty catalogs", () => {
    expect(moveActiveListboxOption(options, null, 1)).toBe("first/value");
    expect(moveActiveListboxOption(options, "first/value", 1)).toBe("last value");
    expect(moveActiveListboxOption(options, "last value", 1)).toBe("last value");
    expect(moveActiveListboxOption(options, "last value", -1)).toBe("first/value");
    expect(moveActiveListboxOption(options, "first/value", -1)).toBe("first/value");
    expect(moveActiveListboxOption([], null, 1)).toBeNull();
    expect(
      moveActiveListboxOption(
        options.map((option) => ({ ...option, disabled: true })),
        null,
        -1,
      ),
    ).toBeNull();
  });
});
