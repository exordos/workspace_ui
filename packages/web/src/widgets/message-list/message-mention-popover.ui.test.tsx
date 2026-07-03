import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MessageMentionPopover } from "./message-mention-popover.ui";

describe("MessageMentionPopover", () => {
  it("renders the fallback mention card without legacy status loading", () => {
    render(
      <MessageMentionPopover
        userId={7}
        anchorRect={new DOMRect(10, 10, 50, 20)}
        fallbackName="@scam"
        onClose={vi.fn()}
        onOpenDirectMessage={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog", { name: /user mention/i })).toBeInTheDocument();
    expect(screen.getByText("scam")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.queryByText(/online|в сети/i)).not.toBeInTheDocument();
  });
});
