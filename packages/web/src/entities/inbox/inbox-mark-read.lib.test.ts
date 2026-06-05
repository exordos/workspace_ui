import { describe, expect, it } from "vitest";
import { applyMarkAsReadToInboxEntries, mapInboxEntryAfterMarkRead } from "./inbox-mark-read.lib";
import { removeInboxEntriesForMarkReadTarget } from "./inbox.lib";
import type { InboxEntry } from "./inbox.types";

const STREAM_ENTRY: InboxEntry = {
  key: "stream:10:general",
  streamId: 10,
  streamName: "engineering",
  topic: "general",
  senderId: null,
  senderName: null,
  dmSlug: null,
  unreadCount: 3,
  lastMessageTimestamp: 100,
  messageIds: [101, 102, 103],
};

const DM_ENTRY: InboxEntry = {
  key: "dm:42",
  streamId: null,
  streamName: null,
  topic: null,
  senderId: 42,
  senderName: "Alice",
  dmSlug: "42",
  unreadCount: 2,
  lastMessageTimestamp: 200,
  messageIds: [201, 202],
};

describe("mapInboxEntryAfterMarkRead", () => {
  it("returns null when all message ids are read", () => {
    expect(mapInboxEntryAfterMarkRead(STREAM_ENTRY, new Set([101, 102, 103]))).toBeNull();
  });

  it("decrements unread count for partial read", () => {
    const result = mapInboxEntryAfterMarkRead(STREAM_ENTRY, new Set([101]));
    expect(result?.unreadCount).toBe(2);
    expect(result?.messageIds).toEqual([102, 103]);
  });

  it("returns unchanged entry when no ids match", () => {
    expect(mapInboxEntryAfterMarkRead(STREAM_ENTRY, new Set([999]))).toBe(STREAM_ENTRY);
  });
});

describe("applyMarkAsReadToInboxEntries", () => {
  it("removes fully read entries and keeps partial ones", () => {
    const result = applyMarkAsReadToInboxEntries([STREAM_ENTRY, DM_ENTRY], [101, 102, 103, 201]);
    expect(result).toHaveLength(1);
    expect(result[0]!.key).toBe("dm:42");
    expect(result[0]!.unreadCount).toBe(1);
    expect(result[0]!.messageIds).toEqual([202]);
  });
});

describe("removeInboxEntriesForMarkReadTarget", () => {
  const entries = [STREAM_ENTRY, DM_ENTRY];

  it("removes DM entry by conversation key", () => {
    const result = removeInboxEntriesForMarkReadTarget(
      entries,
      { type: "dm", userIds: [7, 42] },
      7,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.key).toBe("stream:10:general");
  });

  it("removes all stream topics for stream-wide mark read", () => {
    const result = removeInboxEntriesForMarkReadTarget(
      entries,
      { type: "stream", streamId: 10 },
      7,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.key).toBe("dm:42");
  });

  it("removes only matching topic", () => {
    const otherTopic: InboxEntry = {
      ...STREAM_ENTRY,
      key: "stream:10:bugs",
      topic: "bugs",
      messageIds: [301],
      unreadCount: 1,
    };
    const result = removeInboxEntriesForMarkReadTarget(
      [STREAM_ENTRY, otherTopic, DM_ENTRY],
      { type: "topic", streamId: 10, topic: "general" },
      7,
    );
    expect(result.map((e) => e.key)).toEqual(["stream:10:bugs", "dm:42"]);
  });
});
