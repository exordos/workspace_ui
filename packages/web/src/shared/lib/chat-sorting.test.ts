import { describe, expect, it } from "vitest";
import type { DmEntryInternal, StreamEntryInternal } from "~/shared/types/sidebar-chat";
import { sortChatsByLastMessage } from "./chat-sorting";

function createStreamEntry(
  streamId: number,
  name: string,
  ts: number,
  unreadCount: number,
  isArchived = false,
): StreamEntryInternal {
  return {
    streamUuid: streamUuid(streamId),
    name,
    lastMessage: `${name} message`,
    time: "10:00",
    ts,
    ...(isArchived ? { isArchived: true } : {}),
    topics: new Map([
      [
        "general",
        {
          subject: "general",
          lastMessage: `${name} topic`,
          time: "10:00",
          ts,
          unreadCount,
        },
      ],
    ]),
  };
}

function streamUuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

function createDmEntry(id: number, name: string, ts: number, unreadCount: number): DmEntryInternal {
  return {
    id,
    name,
    slug: `${id}-${name.toLowerCase()}`,
    lastMessage: `${name} dm`,
    time: "10:00",
    ts,
    unreadCount,
  };
}

describe("sortChatsByLastMessage", () => {
  it("keeps muted streams below unmuted chats and suppresses their unread badges", () => {
    const streamsMap = new Map<string, StreamEntryInternal>([
      [streamUuid(10), createStreamEntry(10, "Muted stream", 5000, 3)],
      [streamUuid(20), createStreamEntry(20, "Active stream", 1000, 0)],
    ]);

    const sorted = sortChatsByLastMessage(streamsMap, new Map(), new Set([streamUuid(10)]));

    expect(sorted[0]).toMatchObject({ type: "stream", streamUuid: streamUuid(20) });
    expect(sorted[1]).toMatchObject({ type: "stream", streamUuid: streamUuid(10) });
    const muted = sorted[1];
    expect(muted?.badge).toBeUndefined();
    expect(muted?.type === "stream" ? muted.topics?.[0]?.badge : undefined).toBeUndefined();
  });

  it("keeps server stream and topic colors in sidebar projection", () => {
    const stream = createStreamEntry(10, "Engineering", 5000, 0);
    stream.color = 0x123456;
    const topic = stream.topics.get("general");
    if (topic != null) {
      topic.color = 0xabcdef;
    }
    const streamsMap = new Map<string, StreamEntryInternal>([[streamUuid(10), stream]]);

    const sorted = sortChatsByLastMessage(streamsMap, new Map(), new Set());

    expect(sorted[0]).toMatchObject({
      type: "stream",
      color: 0x123456,
      topics: [expect.objectContaining({ color: 0xabcdef })],
    });
  });

  it("keeps completed topic state in the selected-folder sidebar projection", () => {
    const stream = createStreamEntry(10, "Engineering", 5000, 0);
    const topic = stream.topics.get("general");
    if (topic != null) {
      topic.isDone = true;
    }
    const streamsMap = new Map<string, StreamEntryInternal>([[streamUuid(10), stream]]);

    const sorted = sortChatsByLastMessage(streamsMap, new Map(), new Set());

    expect(sorted[0]).toMatchObject({
      type: "stream",
      topics: [expect.objectContaining({ isDone: true })],
    });
  });

  it("uses server stream unread badge without client-side topic recomputation", () => {
    const streamsMap = new Map<string, StreamEntryInternal>([
      [
        streamUuid(10),
        {
          streamUuid: streamUuid(10),
          name: "Engineering",
          lastMessage: "Engineering message",
          time: "10:00",
          ts: 5000,
          topics: new Map([
            [
              "muted",
              {
                subject: "muted",
                lastMessage: "Muted topic",
                time: "10:00",
                ts: 5000,
                unreadCount: 4,
              },
            ],
            [
              "open",
              {
                subject: "open",
                lastMessage: "Open topic",
                time: "09:00",
                ts: 1000,
                unreadCount: 2,
              },
            ],
          ]),
        },
      ],
    ]);

    const sorted = sortChatsByLastMessage(streamsMap, new Map(), new Set(), {
      isEffectivelyMuted: (streamId, topic) => streamId === streamUuid(10) && topic === "muted",
    });

    const stream = sorted[0];
    expect(stream?.badge).toBeUndefined();
    expect(stream?.type === "stream" ? stream.topics?.[0]?.badge : undefined).toBeUndefined();
    expect(stream?.type === "stream" ? stream.topics?.[1]?.badge : undefined).toBe(2);
  });

  it("keeps server timestamp order when personal unread prioritization is requested", () => {
    const streamsMap = new Map<string, StreamEntryInternal>([
      [streamUuid(1), createStreamEntry(1, "General", 5000, 1)],
    ]);
    const dmsMap = new Map<string, DmEntryInternal>([
      ["42-alice", createDmEntry(42, "Alice", 1000, 1)],
    ]);

    const withoutFlag = sortChatsByLastMessage(streamsMap, dmsMap, new Set());
    expect(withoutFlag[0]?.type).toBe("stream");

    const withFlag = sortChatsByLastMessage(streamsMap, dmsMap, new Set(), {
      prioritizePersonalUnread: true,
    });
    expect(withFlag[0]?.type).toBe("stream");
  });

  it("prioritizes unread unmuted channels above muted unread channels when enabled", () => {
    const streamsMap = new Map<string, StreamEntryInternal>([
      [streamUuid(10), createStreamEntry(10, "Muted stream", 5000, 1)],
      [streamUuid(20), createStreamEntry(20, "Active stream", 1000, 1)],
    ]);
    const dmsMap = new Map<string, DmEntryInternal>();

    const withoutFlag = sortChatsByLastMessage(streamsMap, dmsMap, new Set([streamUuid(10)]));
    expect(withoutFlag[0]).toMatchObject({ type: "stream", streamUuid: streamUuid(20) });

    const withFlag = sortChatsByLastMessage(streamsMap, dmsMap, new Set([streamUuid(10)]), {
      prioritizeUnmutedUnreadChannels: true,
    });
    expect(withFlag[0]).toMatchObject({ type: "stream", streamUuid: streamUuid(20) });
  });

  it("excludes archived streams from sidebar projection", () => {
    const streamsMap = new Map<string, StreamEntryInternal>([
      [streamUuid(1), createStreamEntry(1, "Active", 2000, 1)],
      [streamUuid(2), createStreamEntry(2, "Archived", 3000, 1, true)],
    ]);

    const sorted = sortChatsByLastMessage(streamsMap, new Map(), new Set());
    expect(sorted).toHaveLength(1);
    expect(sorted[0]).toMatchObject({ type: "stream", streamUuid: streamUuid(1), name: "Active" });
  });

  it("hides streams with unknown archived status in strict mode", () => {
    const streamsMap = new Map<string, StreamEntryInternal>([
      [
        streamUuid(1),
        {
          ...createStreamEntry(1, "Known Active", 2000, 1, false),
          isArchived: false,
        },
      ],
      [
        streamUuid(2),
        {
          streamUuid: streamUuid(2),
          name: "Unknown",
          lastMessage: "Unknown message",
          time: "10:00",
          ts: 3000,
          topics: new Map([
            [
              "general",
              {
                subject: "general",
                lastMessage: "Unknown topic",
                time: "10:00",
                ts: 3000,
                unreadCount: 1,
              },
            ],
          ]),
        },
      ],
    ]);

    const sorted = sortChatsByLastMessage(streamsMap, new Map(), new Set(), {
      hideUnknownArchivedStreams: true,
    });
    expect(sorted).toHaveLength(1);
    expect(sorted[0]).toMatchObject({
      type: "stream",
      streamUuid: streamUuid(1),
      name: "Known Active",
    });
  });

  it("keeps streams with unknown archived status when strict mode is disabled", () => {
    const streamsMap = new Map<string, StreamEntryInternal>([
      [
        streamUuid(1),
        {
          ...createStreamEntry(1, "Known Active", 2000, 1, false),
          isArchived: false,
        },
      ],
      [
        streamUuid(2),
        {
          streamUuid: streamUuid(2),
          name: "Unknown",
          lastMessage: "Unknown message",
          time: "10:00",
          ts: 3000,
          topics: new Map([
            [
              "general",
              {
                subject: "general",
                lastMessage: "Unknown topic",
                time: "10:00",
                ts: 3000,
                unreadCount: 1,
              },
            ],
          ]),
        },
      ],
    ]);

    const sorted = sortChatsByLastMessage(streamsMap, new Map(), new Set(), {
      hideUnknownArchivedStreams: false,
    });
    expect(sorted).toHaveLength(2);
    expect(sorted[0]).toMatchObject({ type: "stream", streamUuid: streamUuid(2), name: "Unknown" });
  });
});
