import { describe, expect, it } from "vitest";
import type { StreamEntryInternal } from "~/shared/types/sidebar-chat";
import {
  buildInboxEntriesFromStreamMetadata,
  groupInboxEntries,
  isInboxEntriesSnapshotFresher,
  removeInboxEntriesForMarkReadTarget,
} from "./inbox.lib";
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
  messageIds: ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"],
};

const STREAM_TOPIC_A: InboxEntry = {
  key: "stream:10:general",
  streamId: "10",
  streamName: "engineering",
  topic: "general",
  senderId: null,
  senderName: null,
  dmSlug: null,
  unreadCount: 3,
  streamUnreadCount: 10,
  lastMessageTimestamp: 300,
  messageIds: [
    "00000000-0000-4000-8000-000000000003",
    "00000000-0000-4000-8000-000000000004",
    "00000000-0000-4000-8000-000000000005",
  ],
};

const STREAM_TOPIC_B: InboxEntry = {
  key: "stream:10:bugs",
  streamId: "10",
  streamName: "engineering",
  topic: "bugs",
  senderId: null,
  senderName: null,
  dmSlug: null,
  unreadCount: 1,
  streamUnreadCount: 10,
  lastMessageTimestamp: 100,
  messageIds: ["00000000-0000-4000-8000-000000000006"],
};

const STREAM_TOPIC_C: InboxEntry = {
  key: "stream:11:design",
  streamId: "11",
  streamName: "design",
  topic: "design",
  senderId: null,
  senderName: null,
  dmSlug: null,
  unreadCount: 1,
  streamUnreadCount: 1,
  lastMessageTimestamp: 500,
  messageIds: ["00000000-0000-4000-8000-000000000007"],
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

  it("uses server stream unread count for a stream group", () => {
    const result = groupInboxEntries([STREAM_TOPIC_A, STREAM_TOPIC_B]);

    expect(result.streams[0]!.unreadCount).toBe(10);
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

type StreamTopicEntry =
  StreamEntryInternal["topics"] extends Map<string, infer Topic> ? Topic : never;

function topicEntry(subject: string, unreadCount: number, ts: number): StreamTopicEntry {
  return {
    topicUuid: `topic-${subject || "default"}`,
    subject,
    lastMessage: "",
    time: "",
    ts,
    unreadCount,
  };
}

function streamEntry(
  streamUuid: string,
  name: string,
  unreadCount: number,
  topics: readonly StreamTopicEntry[] = [],
): StreamEntryInternal {
  return {
    streamUuid,
    name,
    lastMessage: "",
    time: "",
    ts: 100,
    unreadCount,
    topics: new Map(topics.map((topic) => [topic.subject, topic])),
  };
}

describe("buildInboxEntriesFromStreamMetadata", () => {
  it("builds topic entries from server unread_count metadata", () => {
    const streamsMap = new Map([
      [
        "10",
        streamEntry("10", "engineering", 3, [
          topicEntry("general", 2, 300),
          topicEntry("bugs", 1, 200),
          topicEntry("read-topic", 0, 400),
        ]),
      ],
    ]);

    const entries = buildInboxEntriesFromStreamMetadata(streamsMap);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      key: "stream:10:topic-general",
      streamId: "10",
      streamName: "engineering",
      topic: "general",
      topicUuid: "topic-general",
      unreadCount: 2,
      streamUnreadCount: 3,
      lastMessageTimestamp: 300,
      messageIds: [],
    });
    expect(entries[1]!.topic).toBe("bugs");
  });

  it("omits muted streams and topics", () => {
    const streamsMap = new Map([
      ["10", streamEntry("10", "muted-channel", 5, [topicEntry("general", 5, 300)])],
      [
        "20",
        streamEntry("20", "engineering", 3, [
          topicEntry("muted-topic", 2, 200),
          topicEntry("open-topic", 1, 100),
        ]),
      ],
    ]);

    const entries = buildInboxEntriesFromStreamMetadata(streamsMap, {
      isStreamMuted: (streamId) => streamId === "10",
      isEffectivelyMuted: (streamId, topic) => streamId === "20" && topic === "muted-topic",
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      key: "stream:20:topic-open-topic",
      unreadCount: 1,
    });
  });

  it("keeps empty default topic as a topic row", () => {
    const streamsMap = new Map([
      ["10", streamEntry("10", "engineering", 1, [topicEntry("", 1, 100)])],
    ]);

    const entries = buildInboxEntriesFromStreamMetadata(streamsMap);

    expect(entries[0]).toMatchObject({
      key: "stream:10:topic-default",
      topic: "",
      topicUuid: "topic-default",
      unreadCount: 1,
    });
  });

  it("uses stream unread_count fallback when topic unread metadata is absent", () => {
    const streamsMap = new Map([["10", streamEntry("10", "engineering", 4, [])]]);

    const entries = buildInboxEntriesFromStreamMetadata(streamsMap);

    expect(entries).toEqual([
      expect.objectContaining({
        key: "stream:10:__all__",
        topic: null,
        unreadCount: 4,
        streamUnreadCount: 4,
      }),
    ]);
  });
});

describe("removeInboxEntriesForMarkReadTarget", () => {
  const entries = [STREAM_TOPIC_A, DM_A];

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
      { type: "stream", streamId: "10" },
      7,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.key).toBe("dm:42");
  });

  it("removes only matching topic", () => {
    const result = removeInboxEntriesForMarkReadTarget(
      [STREAM_TOPIC_A, STREAM_TOPIC_B, DM_A],
      { type: "topic", streamId: "10", topic: "general" },
      7,
    );
    expect(result.map((e) => e.key)).toEqual(["stream:10:bugs", "dm:42"]);
  });
});

describe("isInboxEntriesSnapshotFresher", () => {
  it("returns true when candidate has newer timestamp", () => {
    const current = [
      { ...DM_A, lastMessageTimestamp: 100, messageIds: ["00000000-0000-4000-8000-000000000010"] },
    ];
    const candidate = [
      { ...DM_A, lastMessageTimestamp: 200, messageIds: ["00000000-0000-4000-8000-000000000011"] },
    ];

    expect(isInboxEntriesSnapshotFresher(candidate, current)).toBe(true);
  });

  it("returns true when timestamp is equal but candidate has higher max messageId", () => {
    const current = [
      {
        ...DM_A,
        lastMessageTimestamp: 200,
        messageIds: [
          "00000000-0000-4000-8000-000000000100",
          "00000000-0000-4000-8000-000000000120",
        ],
      },
    ];
    const candidate = [
      {
        ...DM_A,
        lastMessageTimestamp: 200,
        messageIds: [
          "00000000-0000-4000-8000-000000000100",
          "00000000-0000-4000-8000-000000000130",
        ],
      },
    ];

    expect(isInboxEntriesSnapshotFresher(candidate, current)).toBe(true);
  });

  it("returns false when candidate is not fresher", () => {
    const current = [
      {
        ...DM_A,
        lastMessageTimestamp: 200,
        messageIds: [
          "00000000-0000-4000-8000-000000000100",
          "00000000-0000-4000-8000-000000000130",
        ],
      },
    ];
    const candidate = [
      {
        ...DM_A,
        lastMessageTimestamp: 200,
        messageIds: [
          "00000000-0000-4000-8000-000000000100",
          "00000000-0000-4000-8000-000000000120",
        ],
      },
    ];

    expect(isInboxEntriesSnapshotFresher(candidate, current)).toBe(false);
  });
});
