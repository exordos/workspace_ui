import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RightDrawer } from "./right-drawer.ui";

describe("RightDrawer", () => {
  it("uses flat geometry classes for drawer shell", () => {
    render(
      <RightDrawer onClose={vi.fn()}>
        <div>Content</div>
      </RightDrawer>,
    );

    const drawer = screen.getByLabelText(/info panel/i);
    expect(drawer).toHaveClass("w-panel-right");
    expect(drawer).not.toHaveClass("rounded-xl");
    expect(drawer).toHaveClass("px-2");
    expect(drawer).toHaveClass("py-5");
    expect(drawer).toHaveClass("bg-sidebar-bg");
  });

  it("uses semantic token classes for close button", () => {
    render(
      <RightDrawer onClose={vi.fn()}>
        <div>Content</div>
      </RightDrawer>,
    );

    const closeButton = screen.getByRole("button");
    expect(closeButton).toHaveClass("text-text-muted");
    expect(closeButton).toHaveClass("hover:bg-card-bg-active");
    expect(closeButton).toHaveClass("hover:text-text-primary");
  });
});
