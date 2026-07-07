import { beforeEach, describe, expect, it } from "vitest";
import { useUsersStore } from "~/entities/user/user.model";
import type { WorkspaceRawMessage } from "~/shared/api/messenger.types";
import { buildSidebarFromMessages, messageToDmEntry, messageToStreamEntry } from "./chat-list.lib";

const STREAM_UUID = "11111111-1111-4111-8111-111111111111";

function dmMessage(overrides: Partial<WorkspaceRawMessage> = {}): WorkspaceRawMessage {
  return {
    id: "00000000-0000-4000-8000-000000000001",
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

  it("treats two-recipient DM as 1:1 when currentUserId is null", () => {
    const entry = messageToDmEntry(dmMessage(), null);
    expect(entry).not.toBeNull();
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
    expect(entry?.name).toBe("Bob");
  });

  it("returns null for 3+ recipient messages (group DMs removed)", () => {
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
    expect(entry).toBeNull();
  });
});

describe("messageToStreamEntry", () => {
  it("maps sender_full_name as stream and topic last message sender", () => {
    const entry = messageToStreamEntry({
      id: "00000000-0000-4000-8000-000000000009",
      sender_id: 20,
      sender_full_name: "Bob",
      content: "hello stream",
      timestamp: 1_700_000_000,
      type: "stream",
      stream_uuid: STREAM_UUID,
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
      id: "00000000-0000-4000-8000-000000000010",
      sender_id: 20,
      sender_full_name: "   ",
      content: "hello stream",
      timestamp: 1_700_000_001,
      type: "stream",
      stream_uuid: STREAM_UUID,
      display_recipient: "engineering",
      subject: "general",
      flags: [],
    });

    expect(entry).not.toBeNull();
    expect(entry?.stream.lastMessageSenderName).toBeUndefined();
    expect(entry?.topic.lastMessageSenderName).toBeUndefined();
  });

  it("uses topic uuid for native stream messages without topic subject", () => {
    const topicUuid = "00000000-0000-4000-8000-0000000000d0";
    const nativeTopic = messageToStreamEntry({
      id: "00000000-0000-4000-8000-000000000011",
      sender_id: 20,
      sender_full_name: "Bob",
      content: "native topic",
      timestamp: 1_700_000_002,
      type: "stream",
      stream_uuid: STREAM_UUID,
      display_recipient: "engineering",
      subject: "",
      topic_uuid: topicUuid,
      flags: [],
    });
    const generalTopic = messageToStreamEntry({
      id: "00000000-0000-4000-8000-000000000012",
      sender_id: 20,
      sender_full_name: "Bob",
      content: "literal general",
      timestamp: 1_700_000_003,
      type: "stream",
      stream_uuid: STREAM_UUID,
      display_recipient: "engineering",
      subject: "general",
      flags: [],
    });

    expect(nativeTopic?.topic.subject).toBe(topicUuid);
    expect(nativeTopic?.topic.topicUuid).toBe(topicUuid);
    expect(generalTopic?.topic.subject).toBe("general");
  });

  it("keeps message source metadata on the derived topic entry", () => {
    const source = {
      kind: "zulip",
      server_url: "https://zulip.example",
      stream_id: 42,
      topic_name: "general",
      message_id: 1001,
    };
    const entry = messageToStreamEntry({
      id: "00000000-0000-4000-8000-000000000013",
      sender_id: 20,
      sender_full_name: "Bob",
      content: "bridged message",
      timestamp: 1_700_000_004,
      type: "stream",
      stream_uuid: STREAM_UUID,
      display_recipient: "engineering",
      subject: "general",
      source_name: "zulip",
      source,
      flags: [],
    });

    expect(entry?.stream.sourceName).toBeUndefined();
    expect(entry?.topic).toMatchObject({
      sourceName: "zulip",
      source,
    });
  });
});

describe("buildSidebarFromMessages", () => {
  it("surfaces source metadata on sidebar topics built from messages", () => {
    const source = {
      kind: "zulip",
      server_url: "https://zulip.example",
      stream_id: 42,
      topic_name: "general",
      message_id: 1001,
    };
    const { streams } = buildSidebarFromMessages(
      [
        {
          id: "00000000-0000-4000-8000-000000000014",
          sender_id: 20,
          sender_full_name: "Bob",
          content: "bridged message",
          timestamp: 1000,
          type: "stream",
          stream_uuid: STREAM_UUID,
          display_recipient: "engineering",
          subject: "general",
          source_name: "zulip",
          source,
          flags: [],
        },
      ],
      null,
    );

    expect(streams[0]?.sourceName).toBeUndefined();
    expect(streams[0]?.topics?.[0]).toMatchObject({
      sourceName: "zulip",
      source,
    });
  });

  it("does not derive unread counts from message flags", () => {
    const messages: WorkspaceRawMessage[] = [
      {
        id: "00000000-0000-4000-8000-000000000001",
        sender_id: 20,
        sender_full_name: "Bob",
        content: "unread stream",
        timestamp: 1000,
        type: "stream",
        stream_uuid: STREAM_UUID,
        display_recipient: "engineering",
        subject: "bugs",
        flags: [],
      },
      {
        id: "00000000-0000-4000-8000-000000000002",
        sender_id: 20,
        sender_full_name: "Bob",
        content: "read stream",
        timestamp: 2000,
        type: "stream",
        stream_uuid: STREAM_UUID,
        display_recipient: "engineering",
        subject: "bugs",
        flags: ["read"],
      },
      {
        id: "00000000-0000-4000-8000-000000000003",
        sender_id: 20,
        sender_full_name: "Bob",
        content: "dm unread",
        timestamp: 3000,
        type: "private",
        display_recipient: [
          { id: 10, full_name: "Me", email: "me@t.com" },
          { id: 20, full_name: "Bob", email: "bob@t.com" },
        ],
        flags: [],
      },
    ];

    const { streamsMap, dmsMap } = buildSidebarFromMessages(messages, 10);

    expect(streamsMap.get(STREAM_UUID)?.topics.get("bugs")?.unreadCount).toBe(0);
    expect(dmsMap.get("10,20")?.unreadCount).toBe(0);
  });
});
