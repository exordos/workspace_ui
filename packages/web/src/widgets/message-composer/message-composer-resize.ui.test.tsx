import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale } from "~/i18n/i18n";
import { MessageComposerHeightButton } from "./message-composer-resize.ui";

describe("MessageComposerHeightButton", () => {
  beforeEach(() => {
    setLocale("en");
  });

  it("uses separate expand and collapse icons with hover-only background", () => {
    const { container, rerender } = render(
      <MessageComposerHeightButton isFullHeight={false} onClick={vi.fn()} />,
    );

    const expandButton = screen.getByRole("button", { name: "Expand message editor" });
    expect(expandButton).toHaveClass(
      "composer-toolbar-btn",
      "h-7",
      "w-7",
      "bg-transparent",
      "text-composer-icon",
    );
    expect(expandButton.className).not.toContain("bg-white/10");
    expect(container.querySelector('[data-composer-icon="expand-content"]')).toBeInTheDocument();

    rerender(<MessageComposerHeightButton isFullHeight onClick={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Collapse message editor" })).toBeInTheDocument();
    expect(container.querySelector('[data-composer-icon="collapse-content"]')).toBeInTheDocument();
  });
});
