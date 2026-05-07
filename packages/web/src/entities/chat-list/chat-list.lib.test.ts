import { beforeEach, describe, expect, it } from "vitest";
import { useUsersStore } from "~/entities/user/user.model";
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import { messageToDmEntry, messageToStreamEntry } from "./chat-list.lib";

function dmMessage(overrides: Partial<ZulipRawMessage> = {}): ZulipRawMessage {
  return {
    id: 1,
    sender_id: 20,
    sender_full_name: "Bob",
    content: "hi",
    timestamp: 1000,
    type: "private",
    display_recipient: [
      { id: 10, full_name: "Alice", email: "a@t.com" },
      { id: 20, full_name: "Bob", email: "b@t.com" },
    ],
    flags: [],
    ...overrides,
  };
}

describe("messageToDmEntry", () => {
  beforeEach(() => {
    useUsersStore.getState().clear();
  });

  it("treats two-recipient DM as 1:1 when currentUserId is null (not a group chat)", () => {
    const entry = messageToDmEntry(dmMessage(), null);
    expect(entry).not.toBeNull();
    expect(entry!.isGroup).toBe(false);
    expect(entry!.userIds).toBeUndefined();
  });

  it("uses non-sender peer id when currentUserId is null", () => {
    const fromBob = messageToDmEntry(dmMessage({ sender_id: 20 }), null);
    expect(fromBob?.id).toBe(10);

    const fromAlice = messageToDmEntry(dmMessage({ sender_id: 10 }), null);
    expect(fromAlice?.id).toBe(20);
  });

  it("uses message recipient name when users store only has Unknown for peer", () => {
    useUsersStore.getState().mergeUser({ user_id: 20, full_name: "" });
    const entry = messageToDmEntry(
      dmMessage({
        sender_id: 10,
        display_recipient: [
          { id: 10, full_name: "Alice", email: "a@t.com" },
          { id: 20, full_name: "Bob", email: "b@t.com" },
        ],
      }),
      10,
    );
    expect(entry?.isGroup).toBe(false);
    expect(entry?.name).toBe("Bob");
  });

  it("still classifies 3+ recipient huddles as group when currentUserId is null", () => {
    const entry = messageToDmEntry(
      dmMessage({
        display_recipient: [
          { id: 10, full_name: "A", email: "a@t.com" },
          { id: 20, full_name: "B", email: "b@t.com" },
          { id: 30, full_name: "C", email: "c@t.com" },
        ],
      }),
      null,
    );
    expect(entry).not.toBeNull();
    expect(entry!.isGroup).toBe(true);
    expect(entry!.userIds).toHaveLength(3);
  });
});

describe("messageToStreamEntry", () => {
  it("maps sender_full_name as stream and topic last message sender", () => {
    const entry = messageToStreamEntry({
      id: 9,
      sender_id: 20,
      sender_full_name: "Bob",
      content: "hello stream",
      timestamp: 1_700_000_000,
      type: "stream",
      stream_id: 10,
      display_recipient: "engineering",
      subject: "general",
      flags: [],
    });

    expect(entry).not.toBeNull();
    expect(entry?.stream.lastMessageSenderName).toBe("Bob");
    expect(entry?.topic.lastMessageSenderName).toBe("Bob");
  });

  it("stores undefined sender name when sender_full_name is empty", () => {
    const entry = messageToStreamEntry({
      id: 10,
      sender_id: 20,
      sender_full_name: "   ",
      content: "hello stream",
      timestamp: 1_700_000_001,
      type: "stream",
      stream_id: 10,
      display_recipient: "engineering",
      subject: "general",
      flags: [],
    });

    expect(entry).not.toBeNull();
    expect(entry?.stream.lastMessageSenderName).toBeUndefined();
    expect(entry?.topic.lastMessageSenderName).toBeUndefined();
  });

  it("keeps empty subject distinct from literal general", () => {
    const emptyTopic = messageToStreamEntry({
      id: 11,
      sender_id: 20,
      sender_full_name: "Bob",
      content: "empty topic",
      timestamp: 1_700_000_002,
      type: "stream",
      stream_id: 10,
      display_recipient: "engineering",
      subject: "",
      flags: [],
    });
    const generalTopic = messageToStreamEntry({
      id: 12,
      sender_id: 20,
      sender_full_name: "Bob",
      content: "literal general",
      timestamp: 1_700_000_003,
      type: "stream",
      stream_id: 10,
      display_recipient: "engineering",
      subject: "general",
      flags: [],
    });

    expect(emptyTopic?.topic.subject).toBe("");
    expect(generalTopic?.topic.subject).toBe("general");
  });
});
