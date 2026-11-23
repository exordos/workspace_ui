// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceMessageSelectionControl } from "./workspace-message-selection-control.ui";

describe("WorkspaceMessageSelectionControl", () => {
  it("renders an unchecked native checkbox with its accessible name", () => {
    render(
      <WorkspaceMessageSelectionControl
        checked={false}
        label="Select message"
        onChange={vi.fn()}
      />,
    );

    const checkbox = screen.getByRole("checkbox", { name: "Select message" });
    expect(checkbox).not.toBeChecked();
    expect(
      document.querySelector("[data-workspace-message-selection-visual='true'] svg"),
    ).not.toBeInTheDocument();
  });

  it("renders the check icon only for a checked control", () => {
    const { rerender } = render(
      <WorkspaceMessageSelectionControl checked={false} label="Select" onChange={vi.fn()} />,
    );

    const getVisual = () =>
      document.querySelector("[data-workspace-message-selection-visual='true']");
    expect(getVisual()?.querySelector("svg")).not.toBeInTheDocument();

    rerender(<WorkspaceMessageSelectionControl checked label="Deselect" onChange={vi.fn()} />);
    expect(getVisual()?.querySelector("svg")).toBeInTheDocument();
  });

  it("forwards native checkbox changes", () => {
    const onChange = vi.fn();
    render(<WorkspaceMessageSelectionControl checked={false} label="Select" onChange={onChange} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("links the checkbox to message-specific context", () => {
    render(
      <>
        <WorkspaceMessageSelectionControl
          checked={false}
          label="Select"
          descriptionId="message-context"
          onChange={vi.fn()}
        />
        <span id="message-context">Bob, 09:00</span>
      </>,
    );

    expect(screen.getByRole("checkbox", { name: "Select" })).toHaveAccessibleDescription(
      "Bob, 09:00",
    );
  });

  it("supports native keyboard selection with Tab and Space", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<WorkspaceMessageSelectionControl checked={false} label="Select" onChange={onChange} />);

    await user.tab();
    expect(screen.getByRole("checkbox", { name: "Select" })).toHaveFocus();

    await user.keyboard(" ");
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("provides a 32px hit area and visible keyboard focus styles", () => {
    render(<WorkspaceMessageSelectionControl checked={false} label="Select" onChange={vi.fn()} />);

    const control = screen.getByLabelText("Select").closest("label");
    const visual = document.querySelector("[data-workspace-message-selection-visual='true']");
    expect(control).toHaveClass("mb-0.5", "h-8", "w-8", "items-center");
    expect(visual).toHaveClass("h-4", "w-4");
    expect(visual).toHaveClass("peer-focus-visible:ring-2");
  });
});
