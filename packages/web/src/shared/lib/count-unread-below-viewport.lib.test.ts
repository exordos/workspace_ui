import { describe, expect, it } from "vitest";
import type { MockMessage } from "~/shared/api/zulip.types";
import {
  countUnreadMessagesBelowViewport,
  isMessageNodeBelowViewport,
} from "./count-unread-below-viewport.lib";

function createMessage(id: number, senderId: number, flags?: string[]): MockMessage {
  return {
    id,
    sender_id: senderId,
    sender_full_name: `User ${senderId}`,
    stream_id: 10,
    display_recipient: "general",
    channel: "general",
    subject: "general",
    content: `<p>Message ${id}</p>`,
    timestamp: 1700000000 + id,
    flags,
  };
}

describe("isMessageNodeBelowViewport", () => {
  it("returns true when message top is at or below root bottom", () => {
    expect(
      isMessageNodeBelowViewport(
        { top: 500, bottom: 540 } as DOMRectReadOnly,
        { top: 0, bottom: 500 } as DOMRectReadOnly,
      ),
    ).toBe(true);
  });

  it("returns false when message intersects the viewport", () => {
    expect(
      isMessageNodeBelowViewport(
        { top: 450, bottom: 490 } as DOMRectReadOnly,
        { top: 0, bottom: 500 } as DOMRectReadOnly,
      ),
    ).toBe(false);
  });
});

describe("countUnreadMessagesBelowViewport", () => {
  it("counts only unread messages from others below the viewport", () => {
    const root = document.createElement("div");
    root.getBoundingClientRect = () => ({
      top: 0,
      bottom: 400,
      left: 0,
      right: 300,
      width: 300,
      height: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    const messages = [
      createMessage(1, 99, ["read"]),
      createMessage(2, 42),
      createMessage(3, 42),
      createMessage(4, 7),
      createMessage(5, 42, ["read"]),
    ];

    const topsById: Record<number, number> = {
      1: 120,
      2: 460,
      3: 510,
      4: 560,
      5: 610,
    };

    for (const message of messages) {
      const node = document.createElement("div");
      node.setAttribute("data-message-id", String(message.id));
      const top = topsById[message.id] ?? 120;
      node.getBoundingClientRect = () => ({
        top,
        bottom: top + 30,
        left: 0,
        right: 300,
        width: 300,
        height: 30,
        x: 0,
        y: top,
        toJSON: () => ({}),
      });
      root.appendChild(node);
    }

    expect(countUnreadMessagesBelowViewport(root, messages, 7)).toBe(2);
  });
});
