import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FormField } from "./form-field.ui";
import { InputSelector } from "./input-selector.ui";

describe("FormField", () => {
  it("labels compound fields without including their action buttons or errors", async () => {
    const user = userEvent.setup();
    render(
      <FormField label="Organization" htmlFor="organization" error="Example error">
        <InputSelector id="organization" options={[]} value="" onValueChange={vi.fn()} />
      </FormField>,
    );
    const input = screen.getByRole("combobox", { name: "Organization" });
    await user.click(screen.getByText("Organization"));
    expect(input).toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent("Example error");
  });
});
