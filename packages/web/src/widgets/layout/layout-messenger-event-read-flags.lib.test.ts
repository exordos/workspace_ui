import { describe, expect, it } from "vitest";
import type { MockMessage } from "~/shared/api/messenger.types";
import { testMessageId } from "~/test/factories";
import {
  collectLoadedMessageIds,
  parseUpdateMessageFlagsEvent,
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

describe("collectLoadedMessageIds", () => {
  it("returns all loaded ids for authoritative mark-all-read events", () => {
    const messages: MockMessage[] = [
      {
        id: "00000000-0000-4000-8000-000000000001",
        sender_id: 2,
        sender_full_name: "Bob",
        stream_uuid: "00000000-0000-4000-8000-000000000005",
        subject: "general",
        content: "",
        timestamp: 0,
        read: true,
      },
      {
        id: "00000000-0000-4000-8000-000000000002",
        sender_id: 2,
        sender_full_name: "Bob",
        stream_uuid: "00000000-0000-4000-8000-000000000005",
        subject: "general",
        content: "",
        timestamp: 0,
        read: false,
      },
      {
        id: "00000000-0000-4000-8000-000000000003",
        sender_id: 2,
        sender_full_name: "Bob",
        stream_uuid: "00000000-0000-4000-8000-000000000005",
        subject: "general",
        content: "",
        timestamp: 0,
      },
    ];
    expect(collectLoadedMessageIds(messages)).toEqual([
      testMessageId(1),
      testMessageId(2),
      testMessageId(3),
    ]);
  });
});
