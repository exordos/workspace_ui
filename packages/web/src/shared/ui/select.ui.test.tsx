import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { AppDialog } from "./app-dialog.ui";
import { Select } from "./select.ui";

const options = [
  { value: "one", label: "First" },
  { value: "disabled", label: "Unavailable", disabled: true },
  { value: "two", label: "Second", description: "Second description" },
];

describe("Select", () => {
  it("dismisses its list before Escape can close the owning dialog", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <AppDialog open onOpenChange={onOpenChange} title="Choose channel">
        <Select options={options} value="one" onValueChange={vi.fn()} aria-label="Channel" />
      </AppDialog>,
    );
    await user.click(screen.getByRole("combobox", { name: "Channel" }));
    await user.keyboard("{ArrowDown}{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Choose channel" })).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
  it("matches typed prefixes and cycles repeated letters", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Select
        options={[
          { value: "en", label: "English" },
          { value: "es", label: "Spanish" },
          { value: "sv", label: "Swedish" },
        ]}
        value="en"
        onValueChange={onValueChange}
        aria-label="Language"
      />,
    );
    screen.getByRole("combobox").focus();
    await user.keyboard("sw{Enter}");
    expect(onValueChange).toHaveBeenLastCalledWith("sv");
    await user.keyboard("{Escape}");
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "s" });
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "s" });
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    // Escape resets the prefix for a new interaction.
    expect(onValueChange).toHaveBeenLastCalledWith("sv");
  });

  it("clears displayed native validation errors after a controlled value becomes valid", () => {
    const onValueChange = vi.fn();
    const view = render(
      <form aria-label="Example">
        <Select
          required
          options={options}
          value=""
          onValueChange={onValueChange}
          aria-label="Channel"
        />
      </form>,
    );
    act(() => {
      expect(screen.getByRole<HTMLFormElement>("form").checkValidity()).toBe(false);
    });
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-invalid", "true");
    view.rerender(
      <form aria-label="Example">
        <Select
          required
          options={options}
          value="one"
          onValueChange={onValueChange}
          aria-label="Channel"
        />
      </form>,
    );
    expect(screen.getByRole<HTMLFormElement>("form").checkValidity()).toBe(true);
    expect(screen.getByRole("combobox")).not.toHaveAttribute("aria-invalid");
  });
  it("selects enabled options with keyboard and restores trigger focus", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Select options={options} value="one" onValueChange={onValueChange} aria-label="Channel" />,
    );
    const trigger = screen.getByRole("combobox", { name: "Channel" });
    trigger.focus();
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(onValueChange).toHaveBeenCalledWith("two");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("supports a real empty-valued option and ignores disabled rows", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Select
        options={[{ value: "", label: "All" }, ...options]}
        value=""
        onValueChange={onValueChange}
        aria-label="Channel"
      />,
    );
    await user.click(screen.getByRole("combobox", { name: "Channel" }));
    expect(screen.getByRole("option", { name: "All" })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("option", { name: "Unavailable" }));
    expect(onValueChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("option", { name: "Second" }));
    expect(onValueChange).toHaveBeenCalledWith("two");
  });

  it("preserves native required validation and named form data", async () => {
    const user = userEvent.setup();
    function Form() {
      const [value, setValue] = useState("");
      return (
        <form aria-label="Example">
          <label htmlFor="channel">Channel</label>
          <Select
            id="channel"
            name="channel"
            required
            options={options}
            value={value}
            onValueChange={setValue}
          />
        </form>
      );
    }
    render(<Form />);
    const form = screen.getByRole<HTMLFormElement>("form", { name: "Example" });
    act(() => {
      expect(form.checkValidity()).toBe(false);
    });
    expect(screen.getByRole("combobox", { name: "Channel" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await user.click(screen.getByRole("combobox", { name: "Channel" }));
    await user.click(screen.getByRole("option", { name: "First" }));
    expect(form.checkValidity()).toBe(true);
    expect(new FormData(form).get("channel")).toBe("one");
  });

  it("dismisses on Escape, outside pointer and Tab without changing selection", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <>
        <Select options={options} value="one" onValueChange={onValueChange} aria-label="Channel" />
        <button>Next</button>
      </>,
    );
    const trigger = screen.getByRole("combobox");
    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await user.click(trigger);
    await user.tab();
    expect(screen.getByRole("button", { name: "Next" })).toHaveFocus();
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("handles removed active options and disabling while open", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const view = render(
      <Select options={options} value="one" onValueChange={onValueChange} aria-label="Channel" />,
    );
    await user.click(screen.getByRole("combobox"));
    view.rerender(
      <Select options={[]} value="one" onValueChange={onValueChange} aria-label="Channel" />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("No options available");
    expect(screen.getByRole("combobox")).not.toHaveAttribute("aria-activedescendant");
    await user.keyboard("{Enter}");
    expect(onValueChange).not.toHaveBeenCalled();
    view.rerender(
      <Select
        options={options}
        disabled
        value="one"
        onValueChange={onValueChange}
        aria-label="Channel"
      />,
    );
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    view.rerender(
      <Select options={options} value="one" onValueChange={onValueChange} aria-label="Channel" />,
    );
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
