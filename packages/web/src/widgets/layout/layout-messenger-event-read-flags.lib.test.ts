import { describe, expect, it } from "vitest";
import type { MockMessage } from "~/shared/api/messenger.types";
import { testMessageId } from "~/test/factories";
import {
  collectUnreadLoadedMessageIds,
  parseUpdateMessageFlagsEvent,
  messengerRawMessagesFromMarkUnreadDetails,
} from "./layout-messenger-event-read-flags.lib";

describe("parseUpdateMessageFlagsEvent", () => {
  it("parses op from op field", () => {
    const parsed = parseUpdateMessageFlagsEvent({
      id: 1,
      type: "update_message_flags",
      op: "add",
      flag: "read",
      messages: [testMessageId(10), testMessageId(20)],
    });
    expect(parsed).toEqual({
      op: "add",
      flag: "read",
      messageIds: ["00000000-0000-4000-8000-000000000010", "00000000-0000-4000-8000-000000000020"],
      markAllRead: false,
    });
  });

  it("falls back to operation when op is missing", () => {
    const parsed = parseUpdateMessageFlagsEvent({
      id: 1,
      type: "update_message_flags",
      operation: "remove",
      flag: "read",
      messages: [testMessageId(5)],
    });
    expect(parsed?.op).toBe("remove");
  });

  it("returns null for invalid op", () => {
    expect(
      parseUpdateMessageFlagsEvent({
        id: 1,
        type: "update_message_flags",
        op: "invalid",
        flag: "read",
        messages: [testMessageId(1)],
      }),
    ).toBeNull();
  });

  it("dedupes and filters invalid message ids", () => {
    const parsed = parseUpdateMessageFlagsEvent({
      id: 1,
      type: "update_message_flags",
      op: "add",
      flag: "read",
      messages: [testMessageId(3), testMessageId(3), "not-a-message-id", testMessageId(4)],
    });
    expect(parsed?.messageIds).toEqual([testMessageId(3), testMessageId(4)]);
  });

  it("sets markAllRead when all is true with read add", () => {
    const parsed = parseUpdateMessageFlagsEvent({
      id: 1,
      type: "update_message_flags",
      op: "add",
      flag: "read",
      all: true,
      messages: [],
    });
    expect(parsed).toEqual({
      op: "add",
      flag: "read",
      messageIds: [],
      markAllRead: true,
    });
  });

  it("returns null for non update_message_flags events", () => {
    expect(parseUpdateMessageFlagsEvent({ id: 1, type: "message" })).toBeNull();
  });
});

describe("collectUnreadLoadedMessageIds", () => {
  it("returns ids without read flag", () => {
    const messages: MockMessage[] = [
      {
        id: "00000000-0000-4000-8000-000000000001",
        sender_id: 2,
        sender_full_name: "Bob",
        stream_id: 5,
        subject: "general",
        content: "",
        timestamp: 0,
        flags: ["read"],
      },
      {
        id: "00000000-0000-4000-8000-000000000002",
        sender_id: 2,
        sender_full_name: "Bob",
        stream_id: 5,
        subject: "general",
        content: "",
        timestamp: 0,
        flags: [],
      },
      {
        id: "00000000-0000-4000-8000-000000000003",
        sender_id: 2,
        sender_full_name: "Bob",
        stream_id: 5,
        subject: "general",
        content: "",
        timestamp: 0,
      },
    ];
    expect(collectUnreadLoadedMessageIds(messages)).toEqual([testMessageId(2), testMessageId(3)]);
  });
});

describe("messengerRawMessagesFromMarkUnreadDetails", () => {
  it("builds stream rows from message_details", () => {
    const rows = messengerRawMessagesFromMarkUnreadDetails(
      ["00000000-0000-4000-8000-000000000042"],
      {
        [testMessageId(42)]: { type: "stream", stream_id: 5, topic: "general" },
      },
      10,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(testMessageId(42));
    expect(rows[0]!.type).toBe("stream");
    expect(rows[0]!.stream_id).toBe(5);
    expect(rows[0]!.subject).toBe("general");
  });

  it("builds private rows from message_details", () => {
    const rows = messengerRawMessagesFromMarkUnreadDetails(
      ["00000000-0000-4000-8000-000000000099"],
      {
        [testMessageId(99)]: { type: "private", user_ids: [10, 20] },
      },
      10,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.type).toBe("private");
    expect(Array.isArray(rows[0]!.display_recipient)).toBe(true);
  });
});
