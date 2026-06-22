/**
 * Tests for the Inbox metadata fetch: reads stream/topic unread_count from chat-list state.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StreamEntryInternal } from "~/shared/types/sidebar-chat";
import {
  fetchInboxEntries,
  fetchUnreadInboxEntries,
  hydrateInboxEntriesFromMetadata,
} from "./inbox.api";

type StreamTopicEntry =
  StreamEntryInternal["topics"] extends Map<string, infer Topic> ? Topic : never;

const streamsMap = vi.hoisted(() => new Map<string, StreamEntryInternal>());

const STREAM_ENGINEERING_UUID = "11111111-1111-4111-8111-111111111111";
const STREAM_DESIGN_UUID = "22222222-2222-4222-8222-222222222222";
const TOPIC_GENERAL_UUID = "33333333-3333-4333-8333-333333333333";
const TOPIC_BUGS_UUID = "44444444-4444-4444-8444-444444444444";

vi.mock("~/entities/chat-list/chat-list.model", () => ({
  useChatListStore: {
    getState: () => ({ streamsMap }),
  },
}));

vi.mock("~/shared/lib/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

beforeEach(() => {
  streamsMap.clear();
});

function topicEntry(
  subject: string,
  topicUuid: string,
  unreadCount: number,
  ts: number,
): StreamTopicEntry {
  return {
    topicUuid,
    subject,
    lastMessage: "",
    time: "",
    ts,
    unreadCount,
  };
}

function setStreamMetadata(options: {
  streamUuid: string;
  name: string;
  unreadCount?: number;
  ts?: number;
  topics?: readonly StreamTopicEntry[];
}): void {
  streamsMap.set(options.streamUuid, {
    streamUuid: options.streamUuid,
    name: options.name,
    lastMessage: "",
    time: "",
    ts: options.ts ?? 0,
    unreadCount: options.unreadCount ?? 0,
    topics: new Map((options.topics ?? []).map((topic) => [topic.subject, topic])),
  });
}

describe("fetchInboxEntries", () => {
  it("builds inbox entries from topic unread_count metadata", async () => {
    setStreamMetadata({
      streamUuid: STREAM_ENGINEERING_UUID,
      name: "engineering",
      unreadCount: 3,
      topics: [
        topicEntry("general", TOPIC_GENERAL_UUID, 2, 100),
        topicEntry("bugs", TOPIC_BUGS_UUID, 1, 200),
      ],
    });

    const entries = await fetchInboxEntries();

    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.topic)).toEqual(["bugs", "general"]);
    expect(entries.map((entry) => entry.unreadCount)).toEqual([1, 2]);
    expect(entries[0]).toMatchObject({
      key: `stream:${STREAM_ENGINEERING_UUID}:bugs`,
      streamId: STREAM_ENGINEERING_UUID,
      streamName: "engineering",
      messageIds: [],
    });
  });

  it("does not derive inbox unread from message rows", async () => {
    setStreamMetadata({
      streamUuid: STREAM_ENGINEERING_UUID,
      name: "engineering",
      unreadCount: 0,
      topics: [topicEntry("general", TOPIC_GENERAL_UUID, 0, 100)],
    });

    await expect(fetchInboxEntries()).resolves.toEqual([]);
  });

  it("uses stream unread_count as a stream-level fallback when topic unread metadata is absent", async () => {
    setStreamMetadata({
      streamUuid: STREAM_ENGINEERING_UUID,
      name: "engineering",
      unreadCount: 5,
      ts: 300,
      topics: [],
    });

    const entries = await fetchInboxEntries();

    expect(entries).toEqual([
      expect.objectContaining({
        key: `stream:${STREAM_ENGINEERING_UUID}:__all__`,
        streamId: STREAM_ENGINEERING_UUID,
        streamName: "engineering",
        topic: null,
        unreadCount: 5,
        lastMessageTimestamp: 300,
        messageIds: [],
      }),
    ]);
  });

  it("omits muted stream/topic metadata when predicates are supplied", async () => {
    setStreamMetadata({
      streamUuid: STREAM_ENGINEERING_UUID,
      name: "engineering",
      topics: [
        topicEntry("general", TOPIC_GENERAL_UUID, 2, 100),
        topicEntry("bugs", TOPIC_BUGS_UUID, 1, 200),
      ],
    });
    setStreamMetadata({
      streamUuid: STREAM_DESIGN_UUID,
      name: "design",
      unreadCount: 4,
      ts: 300,
      topics: [],
    });

    const entries = await fetchInboxEntries(null, {
      isStreamMuted: (streamId) => streamId === STREAM_DESIGN_UUID,
      isEffectivelyMuted: (streamId, topic) =>
        streamId === STREAM_ENGINEERING_UUID && topic === "general",
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      streamId: STREAM_ENGINEERING_UUID,
      topic: "bugs",
      unreadCount: 1,
    });
  });
});

describe("fetchUnreadInboxEntries", () => {
  it("returns metadata entries, a complete result, and no message snapshot", async () => {
    setStreamMetadata({
      streamUuid: STREAM_ENGINEERING_UUID,
      name: "engineering",
      topics: [topicEntry("general", TOPIC_GENERAL_UUID, 2, 100)],
    });

    const result = await fetchUnreadInboxEntries(7);

    expect(result.complete).toBe(true);
    expect(result.messages).toEqual([]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.unreadCount).toBe(2);
  });

  it("throws on aborted requests without reading metadata", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(fetchUnreadInboxEntries(null, {}, { signal: controller.signal })).rejects.toThrow(
      "Aborted",
    );
  });
});

describe("hydrateInboxEntriesFromMetadata", () => {
  it("hydrates from current metadata instead of cached unread messages", async () => {
    setStreamMetadata({
      streamUuid: STREAM_ENGINEERING_UUID,
      name: "engineering",
      topics: [topicEntry("general", TOPIC_GENERAL_UUID, 3, 100)],
    });

    const entries = await hydrateInboxEntriesFromMetadata("instance-1", 7);

    expect(entries).toHaveLength(1);
    expect(entries[0]!.unreadCount).toBe(3);
    expect(entries[0]!.messageIds).toEqual([]);
  });
});
