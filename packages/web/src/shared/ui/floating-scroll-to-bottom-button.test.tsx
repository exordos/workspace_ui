import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FloatingScrollToBottomButton } from "./floating-scroll-to-bottom-button";

describe("FloatingScrollToBottomButton", () => {
  it("renders without badge when unread count is zero", () => {
    const onClick = vi.fn();
    render(<FloatingScrollToBottomButton onClick={onClick} unreadCount={0} />);

    expect(screen.getByRole("button", { name: /scroll to bottom/i })).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("shows unread badge and aria label when count is positive", () => {
    const onClick = vi.fn();
    render(<FloatingScrollToBottomButton onClick={onClick} unreadCount={3} />);

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /3 unread messages/i })).toBeInTheDocument();
  });

  it("calls onClick when pressed", () => {
    const onClick = vi.fn();
    render(<FloatingScrollToBottomButton onClick={onClick} unreadCount={2} />);

    fireEvent.click(screen.getByRole("button", { name: /2 unread messages/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
