import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccessibleAlertDialog } from "./accessible-alert-dialog.ui";

describe("AccessibleAlertDialog", () => {
  it("exposes modal semantics, closes on Escape, and restores focus", () => {
    const onDismiss = vi.fn();
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const { unmount } = render(
      <AccessibleAlertDialog label="Confirm action" onDismiss={onDismiss}>
        <button type="button">Confirm</button>
        <button type="button">Cancel</button>
      </AccessibleAlertDialog>,
    );

    const dialog = screen.getByRole("alertdialog", { name: "Confirm action" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledOnce();

    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});
