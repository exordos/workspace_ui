import { describe, expect, it } from "vitest";
import type { MockMessage } from "~/shared/api/zulip.types";
import { countUnreadMessages, resolveFirstUnreadBoundaryMessageId } from "./chat-first-unread.lib";

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

describe("chat-first-unread", () => {
  it("returns first unread message id from other users", () => {
    const messages: MockMessage[] = [
      createMessage(1, 99, ["read"]),
      createMessage(2, 7),
      createMessage(3, 42),
      createMessage(4, 42),
    ];

    const result = resolveFirstUnreadBoundaryMessageId(messages, 7);

    expect(result).toBe(3);
  });

  it("returns undefined when only own unread messages exist", () => {
    const messages: MockMessage[] = [
      createMessage(1, 7, ["read"]),
      createMessage(2, 7),
      createMessage(3, 7),
    ];

    const result = resolveFirstUnreadBoundaryMessageId(messages, 7);

    expect(result).toBeUndefined();
  });

  it("counts unread messages from others when currentUserId is set", () => {
    const messages: MockMessage[] = [
      createMessage(1, 7, ["read"]),
      createMessage(2, 7),
      createMessage(3, 42),
      createMessage(4, 99, ["read"]),
    ];

    const result = countUnreadMessages(messages, 7);

    expect(result).toBe(1);
  });

  it("counts every message without read when currentUserId is omitted", () => {
    const messages: MockMessage[] = [
      createMessage(1, 7, ["read"]),
      createMessage(2, 7),
      createMessage(3, 42),
      createMessage(4, 99, ["read"]),
    ];

    const result = countUnreadMessages(messages);

    expect(result).toBe(2);
  });
});
