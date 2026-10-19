import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppDialog, DialogCloseIconButton } from "./app-dialog.ui";

describe("AppDialog", () => {
  it("renders a header close icon by default and closes via onOpenChange", () => {
    const onOpenChange = vi.fn();

    render(
      <AppDialog open onOpenChange={onOpenChange} title="Sync settings">
        <p>Body</p>
      </AppDialog>,
    );

    const close = screen.getByRole("button", { name: "Close" });
    expect(close).toBeInTheDocument();
    fireEvent.click(close);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("hides the header close icon when showCloseButton is false", () => {
    render(
      <AppDialog open onOpenChange={vi.fn()} title="Locked dialog" showCloseButton={false}>
        <p>Body</p>
      </AppDialog>,
    );

    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });

  it("keeps the header close icon available when scrollBody is enabled", () => {
    render(
      <AppDialog open onOpenChange={vi.fn()} title="Scrollable" scrollBody>
        <p>Long body</p>
      </AppDialog>,
    );

    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });
});

describe("DialogCloseIconButton", () => {
  it("renders an accessible close control", () => {
    render(
      <AppDialog open onOpenChange={vi.fn()} title="Shell" showCloseButton={false}>
        <DialogCloseIconButton />
      </AppDialog>,
    );

    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });
});
