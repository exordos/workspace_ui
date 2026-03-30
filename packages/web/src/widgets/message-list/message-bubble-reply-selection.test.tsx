import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MockMessage } from "~/shared/api/zulip.types";
import { MessageBubble } from "./message-bubble.ui";

function createMessage(overrides: Partial<MockMessage> = {}): MockMessage {
  return {
    id: 1,
    sender_id: 77,
    sender_full_name: "Alice",
    stream_id: 10,
    subject: "general",
    content: "<p>Hello selected quote</p>",
    timestamp: 1710000000,
    ...overrides,
  };
}

describe("MessageBubble reply selected text", () => {
  afterEach(() => {
    window.getSelection()?.removeAllRanges();
  });

  it("passes selected text to reply callback when selection is inside message body", async () => {
    const onReply = vi.fn();
    render(
      <MessageBubble
        message={createMessage()}
        callbacks={{
          onReply,
        }}
      />,
    );

    const textNode = screen.getByText("Hello selected quote").firstChild;
    expect(textNode).not.toBeNull();
    const range = document.createRange();
    range.setStart(textNode!, 0);
    range.setEnd(textNode!, 5);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    fireEvent.contextMenu(screen.getByTestId("message-1"));
    fireEvent.click(await screen.findByRole("menuitem", { name: /reply/i }));

    expect(onReply).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), "Hello");
  });

  it("falls back to full-message reply when no selection exists", async () => {
    const onReply = vi.fn();
    render(
      <MessageBubble
        message={createMessage()}
        callbacks={{
          onReply,
        }}
      />,
    );

    fireEvent.contextMenu(screen.getByTestId("message-1"));
    fireEvent.click(await screen.findByRole("menuitem", { name: /reply/i }));

    expect(onReply).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), undefined);
  });
});

describe("MessageBubble forward selected text", () => {
  afterEach(() => {
    window.getSelection()?.removeAllRanges();
  });

  it("passes selected text to forward callback when selection is inside message body", async () => {
    const onForward = vi.fn();
    render(
      <MessageBubble
        message={createMessage()}
        callbacks={{
          onForward,
        }}
      />,
    );

    const textNode = screen.getByText("Hello selected quote").firstChild;
    expect(textNode).not.toBeNull();
    const range = document.createRange();
    range.setStart(textNode!, 0);
    range.setEnd(textNode!, 5);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    fireEvent.contextMenu(screen.getByTestId("message-1"));
    fireEvent.click(await screen.findByRole("menuitem", { name: /forward/i }));

    expect(onForward).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), "Hello");
  });

  it("falls back to full-message forward when no selection exists", async () => {
    const onForward = vi.fn();
    render(
      <MessageBubble
        message={createMessage()}
        callbacks={{
          onForward,
        }}
      />,
    );

    fireEvent.contextMenu(screen.getByTestId("message-1"));
    fireEvent.click(await screen.findByRole("menuitem", { name: /forward/i }));

    expect(onForward).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), undefined);
  });
});
