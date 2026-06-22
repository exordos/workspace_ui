import { describe, expect, it } from "vitest";
import type { MockMessage } from "~/shared/api/messenger.types";
import { testMessageId, testMessageOrdinal } from "~/test/factories";
import {
  resolveFirstUnreadBoundaryMessageId,
  resolveLastUnreadBoundaryMessageId,
} from "./message-unread-boundary.lib";

function createMessage(id: number | string, senderId: number, read = false): MockMessage {
  return {
    id: testMessageId(id),
    sender_id: senderId,
    sender_full_name: `User ${senderId}`,
    stream_id: 10,
    display_recipient: "general",
    channel: "general",
    subject: "general",
    content: `<p>Message ${id}</p>`,
    timestamp: 1700000000 + testMessageOrdinal(id),
    read,
  };
}

describe("message-unread-boundary", () => {
  const messages: MockMessage[] = [
    createMessage(1, 99, true),
    createMessage(2, 42),
    createMessage(3, 42),
    createMessage(4, 7, true),
    createMessage(5, 42),
  ];

  it("resolveFirstUnreadBoundaryMessageId returns first other-user unread", () => {
    expect(resolveFirstUnreadBoundaryMessageId(messages, 7)).toBe(testMessageId(2));
  });

  it("resolveLastUnreadBoundaryMessageId returns last other-user unread", () => {
    expect(resolveLastUnreadBoundaryMessageId(messages, 7)).toBe(testMessageId(5));
  });
});
