import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Checkbox, CheckboxIndicator } from "./checkbox.ui";

function FormExample() {
  const [checked, setChecked] = useState(false);
  return (
    <form aria-label="Preferences">
      <label htmlFor="updates">
        <Checkbox
          id="updates"
          name="updates"
          value="enabled"
          checked={checked}
          onChange={(event) => setChecked(event.target.checked)}
        />
        Receive updates
      </label>
    </form>
  );
}

describe("Checkbox", () => {
  it("uses the label, keyboard and native form value with a controlled selection", async () => {
    const user = userEvent.setup();
    render(<FormExample />);
    const checkbox = screen.getByRole("checkbox", { name: "Receive updates" });
    const form = screen.getByRole<HTMLFormElement>("form", { name: "Preferences" });
    expect(new FormData(form).has("updates")).toBe(false);
    await user.tab();
    expect(checkbox).toHaveFocus();
    await user.keyboard(" ");
    expect(checkbox).toBeChecked();
    expect(new FormData(form).get("updates")).toBe("enabled");
    await user.click(screen.getByText("Receive updates"));
    expect(checkbox).not.toBeChecked();
  });
  it("forwards the input ref and keeps disabled controls out of keyboard interaction", async () => {
    const user = userEvent.setup();
    const ref = createRef<HTMLInputElement>();
    const onChange = vi.fn();
    render(<Checkbox ref={ref} checked disabled onChange={onChange} aria-label="Unavailable" />);
    const checkbox = screen.getByRole("checkbox", { name: "Unavailable" });
    expect(ref.current).toBe(checkbox);
    await user.click(checkbox);
    await user.tab();
    expect(checkbox).not.toHaveFocus();
    expect(checkbox).toBeChecked();
    expect(onChange).not.toHaveBeenCalled();
  });
  it("keeps decorative indicators inside a parent button out of the focus order", async () => {
    const user = userEvent.setup();
    render(
      <button type="button">
        <CheckboxIndicator checked />
        Choose answer
      </button>,
    );
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await user.tab();
    expect(screen.getByRole("button", { name: "Choose answer" })).toHaveFocus();
  });
});
