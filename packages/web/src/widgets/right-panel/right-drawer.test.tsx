import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RightDrawer } from "./right-drawer.ui";

describe("RightDrawer", () => {
  it("uses rounded shell geometry aligned with the left sidebar", () => {
    render(
      <RightDrawer onClose={vi.fn()}>
        <div>Content</div>
      </RightDrawer>,
    );

    const drawer = screen.getByLabelText(/info panel/i);
    expect(drawer).toHaveClass("w-panel-right");
    expect(drawer).toHaveClass("rounded-lg");
    expect(drawer).toHaveClass("px-2");
    expect(drawer).toHaveClass("bg-bg-elevated");
    expect(drawer).toHaveClass("relative");
  });

  it("renders panel title in the same header row as the close button", () => {
    render(
      <RightDrawer onClose={vi.fn()} title="Channel info">
        <div>Content</div>
      </RightDrawer>,
    );

    const title = screen.getByRole("heading", { name: "Channel info" });
    const closeButton = screen.getByRole("button", { name: /close/i });
    const header = title.closest("header");

    expect(header).not.toBeNull();
    expect(header).toContainElement(closeButton);
    expect(closeButton).not.toHaveClass("absolute");
  });

  it("keeps close button when title is omitted", () => {
    render(
      <RightDrawer onClose={vi.fn()}>
        <div>Content</div>
      </RightDrawer>,
    );

    expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <RightDrawer onClose={onClose} title="Settings">
        <div>Content</div>
      </RightDrawer>,
    );

    await user.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("uses semantic token classes for close button", () => {
    render(
      <RightDrawer onClose={vi.fn()} title="Profile">
        <div>Content</div>
      </RightDrawer>,
    );

    const closeButton = screen.getByRole("button", { name: /close/i });
    expect(closeButton).toHaveClass("text-text-muted");
    expect(closeButton).toHaveClass("hover:bg-card-bg-active");
    expect(closeButton).toHaveClass("hover:text-text-primary");
  });
});
