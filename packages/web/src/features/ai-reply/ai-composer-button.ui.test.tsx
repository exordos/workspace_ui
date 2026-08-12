import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AiComposerButton } from "./ai-reply.ui";

describe("AiComposerButton", () => {
  it("uses the shared composer toolbar button wrapper and keeps click behavior", () => {
    const onClick = vi.fn();
    const { container } = render(<AiComposerButton onClick={onClick} active={false} />);

    const button = screen.getByRole("button", { name: "AI assistant" });
    const label = screen.getByText("AI");

    // Same shell as FormattingToolbar / emoji / attach — hover highlight comes from CSS
    expect(button).toHaveClass("composer-toolbar-btn", "h-8", "w-8");
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(label).toHaveClass("font-sans", "text-[20px]", "font-normal", "leading-none");
    expect(label).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("svg")).not.toBeInTheDocument();

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("marks the button pressed when the AI menu is open", () => {
    render(<AiComposerButton onClick={vi.fn()} active />);

    const button = screen.getByRole("button", { name: "AI assistant" });
    expect(button).toHaveClass("text-icon-active");
    expect(button).toHaveAttribute("aria-pressed", "true");
  });
});
