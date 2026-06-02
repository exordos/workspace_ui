import { describe, expect, it } from "vitest";
import type { MockMessage } from "~/shared/api/zulip.types";
import { groupInboxEntries, isInboxEntriesSnapshotFresher } from "./inbox.lib";
import type { InboxEntry } from "./inbox.types";

const DM_A: InboxEntry = {
  key: "dm:42",
  streamId: null,
  streamName: null,
  topic: null,
  senderId: 42,
  senderName: "Alice",
  dmSlug: "42",
  unreadCount: 2,
  lastMessageTimestamp: 200,
  messageIds: [1, 2],
};

const STREAM_TOPIC_A: InboxEntry = {
  key: "stream:10:general",
  streamId: 10,
  streamName: "engineering",
  topic: "general",
  senderId: null,
  senderName: null,
  dmSlug: null,
  unreadCount: 3,
  lastMessageTimestamp: 300,
  messageIds: [3, 4, 5],
};

const STREAM_TOPIC_B: InboxEntry = {
  key: "stream:10:bugs",
  streamId: 10,
  streamName: "engineering",
  topic: "bugs",
  senderId: null,
  senderName: null,
  dmSlug: null,
  unreadCount: 1,
  lastMessageTimestamp: 100,
  messageIds: [6],
};

const STREAM_TOPIC_C: InboxEntry = {
  key: "stream:11:design",
  streamId: 11,
  streamName: "design",
  topic: "design",
  senderId: null,
  senderName: null,
  dmSlug: null,
  unreadCount: 1,
  lastMessageTimestamp: 500,
  messageIds: [7],
};

describe("groupInboxEntries", () => {
  it("separates DM and stream entries", () => {
    const result = groupInboxEntries([DM_A, STREAM_TOPIC_A]);

    expect(result.dms).toHaveLength(1);
    expect(result.streams).toHaveLength(1);
  });

  it("groups stream topics under their parent stream", () => {
    const result = groupInboxEntries([STREAM_TOPIC_A, STREAM_TOPIC_B]);

    expect(result.streams).toHaveLength(1);
    expect(result.streams[0]!.topics.map((t) => t.topic)).toEqual(["general", "bugs"]);
  });

  it("sorts stream groups by newest activity descending", () => {
    const result = groupInboxEntries([STREAM_TOPIC_A, STREAM_TOPIC_C]);

    expect(result.streams[0]!.streamName).toBe("design");
    expect(result.streams[1]!.streamName).toBe("engineering");
  });

  it("sorts topics inside a stream by newest activity descending", () => {
    const result = groupInboxEntries([STREAM_TOPIC_B, STREAM_TOPIC_A]);

    expect(result.streams[0]!.topics[0]!.topic).toBe("general");
    expect(result.streams[0]!.topics[1]!.topic).toBe("bugs");
  });

  it("aggregates unread counts per stream group", () => {
    const result = groupInboxEntries([STREAM_TOPIC_A, STREAM_TOPIC_B]);

    expect(result.streams[0]!.unreadCount).toBe(4);
  });

  it("sorts DMs by newest activity descending", () => {
    const dmB: InboxEntry = {
      ...DM_A,
      key: "dm:99",
      senderId: 99,
      senderName: "Bob",
      lastMessageTimestamp: 800,
    };
    const result = groupInboxEntries([DM_A, dmB]);

    expect(result.dms[0]!.senderName).toBe("Bob");
    expect(result.dms[1]!.senderName).toBe("Alice");
  });
});

describe("buildInboxEntries", () => {
  it("omits muted stream and topic messages from inbox entries", async () => {
    const { buildInboxEntries } = await import("./inbox.lib");
    const messages: MockMessage[] = [
      {
        id: 10,
        sender_id: 42,
        sender_full_name: "Alice",
        stream_id: 10,
        channel: "muted-channel",
        subject: "general",
        content: "Muted channel unread",
        timestamp: 300,
        display_recipient: "muted-channel",
      },
      {
        id: 11,
        sender_id: 42,
        sender_full_name: "Alice",
        stream_id: 20,
        channel: "engineering",
        subject: "muted-topic",
        content: "Muted topic unread",
        timestamp: 200,
        display_recipient: "engineering",
      },
      {
        id: 12,
        sender_id: 42,
        sender_full_name: "Alice",
        stream_id: 20,
        channel: "engineering",
        subject: "open-topic",
        content: "Open topic unread",
        timestamp: 100,
        display_recipient: "engineering",
      },
    ];

    const entries = buildInboxEntries(messages, 7, {
      isStreamMuted: (streamId) => streamId === 10,
      isEffectivelyMuted: (streamId, topic) => streamId === 20 && topic === "muted-topic",
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      key: "stream:20:open-topic",
      messageIds: [12],
      unreadCount: 1,
    });
  });

  it("omits unread messages from muted streams even when topic predicate would allow them", async () => {
    const { buildInboxEntries } = await import("./inbox.lib");
    const messages: MockMessage[] = [
      {
        id: 20,
        sender_id: 42,
        sender_full_name: "Alice",
        stream_id: 10,
        channel: "muted-channel",
        subject: "followed-topic",
        content: "Muted channel unread",
        timestamp: 300,
        display_recipient: "muted-channel",
      },
    ];

    const entries = buildInboxEntries(messages, 7, {
      isStreamMuted: (streamId) => streamId === 10,
      isEffectivelyMuted: () => false,
    });

    expect(entries).toEqual([]);
  });

  it("groups unread private messages by DM conversation rather than sender", async () => {
    const { buildInboxEntries } = await import("./inbox.lib");
    const messages: MockMessage[] = [
      {
        id: 10,
        sender_id: 42,
        sender_full_name: "Alice",
        stream_id: null,
        channel: undefined,
        subject: "",
        content: "Hello",
        timestamp: 100,
        display_recipient: [
          { id: 7, full_name: "Me" },
          { id: 42, full_name: "Alice" },
          { id: 99, full_name: "Bob" },
        ],
      },
      {
        id: 11,
        sender_id: 99,
        sender_full_name: "Bob",
        stream_id: null,
        channel: undefined,
        subject: "",
        content: "Reply",
        timestamp: 200,
        display_recipient: [
          { id: 7, full_name: "Me" },
          { id: 42, full_name: "Alice" },
          { id: 99, full_name: "Bob" },
        ],
      },
    ];

    const entries = buildInboxEntries(messages, 7);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      key: "dm:42,99",
      dmSlug: "42,99",
      senderId: null,
      senderName: "Alice, Bob",
      unreadCount: 2,
      messageIds: [10, 11],
      lastMessageTimestamp: 200,
    });
  });

  it("keeps empty stream topic without falling back to general", async () => {
    const { buildInboxEntries } = await import("./inbox.lib");
    const messages: MockMessage[] = [
      {
        id: 77,
        sender_id: 42,
        sender_full_name: "Alice",
        stream_id: 10,
        channel: "engineering",
        subject: "",
        content: "Unread stream without topic",
        timestamp: 100,
        display_recipient: "engineering",
      },
    ];

    const entries = buildInboxEntries(messages, 7);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      key: "stream:10:",
      streamId: 10,
      streamName: "engineering",
      topic: "",
      unreadCount: 1,
      messageIds: [77],
    });
  });
});

describe("isInboxEntriesSnapshotFresher", () => {
  it("returns true when candidate has newer timestamp", () => {
    const current = [{ ...DM_A, lastMessageTimestamp: 100, messageIds: [10] }];
    const candidate = [{ ...DM_A, lastMessageTimestamp: 200, messageIds: [11] }];

    expect(isInboxEntriesSnapshotFresher(candidate, current)).toBe(true);
  });

  it("returns true when timestamp is equal but candidate has higher max messageId", () => {
    const current = [{ ...DM_A, lastMessageTimestamp: 200, messageIds: [100, 120] }];
    const candidate = [{ ...DM_A, lastMessageTimestamp: 200, messageIds: [100, 130] }];

    expect(isInboxEntriesSnapshotFresher(candidate, current)).toBe(true);
  });

  it("returns false when candidate is not fresher", () => {
    const current = [{ ...DM_A, lastMessageTimestamp: 200, messageIds: [100, 130] }];
    const candidate = [{ ...DM_A, lastMessageTimestamp: 200, messageIds: [100, 120] }];

    expect(isInboxEntriesSnapshotFresher(candidate, current)).toBe(false);
  });
});
