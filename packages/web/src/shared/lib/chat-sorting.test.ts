import { describe, expect, it } from "vitest";
import type { DmEntryInternal, StreamEntryInternal } from "~/shared/types/sidebar-chat";
import { sortChatsByLastMessage } from "./chat-sorting";

function createStreamEntry(
  stream_id: number,
  name: string,
  ts: number,
  unreadCount: number,
  isArchived = false,
): StreamEntryInternal {
  return {
    stream_id,
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

function createDmEntry(
  id: number,
  name: string,
  ts: number,
  unreadCount: number,
  isGroup = false,
): DmEntryInternal {
  return {
    id,
    name,
    slug: `${id}-${name.toLowerCase()}`,
    isGroup,
    lastMessage: `${name} dm`,
    time: "10:00",
    ts,
    unreadCount,
  };
}

describe("sortChatsByLastMessage", () => {
  it("keeps muted streams below unmuted chats and suppresses their unread badges", () => {
    const streamsMap = new Map<number, StreamEntryInternal>([
      [10, createStreamEntry(10, "Muted stream", 5000, 3)],
      [20, createStreamEntry(20, "Active stream", 1000, 0)],
    ]);

    const sorted = sortChatsByLastMessage(streamsMap, new Map(), new Set([10]));

    expect(sorted[0]).toMatchObject({ type: "stream", stream_id: 20 });
    expect(sorted[1]).toMatchObject({ type: "stream", stream_id: 10 });
    const muted = sorted[1];
    expect(muted?.badge).toBeUndefined();
    expect(muted?.type === "stream" ? muted.topics?.[0]?.badge : undefined).toBeUndefined();
  });

  it("suppresses unread badges for muted topics while preserving unmuted topic badges", () => {
    const streamsMap = new Map<number, StreamEntryInternal>([
      [
        10,
        {
          stream_id: 10,
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
      isEffectivelyMuted: (streamId, topic) => streamId === 10 && topic === "muted",
    });

    const stream = sorted[0];
    expect(stream?.badge).toBe(2);
    expect(stream?.type === "stream" ? stream.topics?.[0]?.badge : undefined).toBeUndefined();
    expect(stream?.type === "stream" ? stream.topics?.[1]?.badge : undefined).toBe(2);
  });

  it("prioritizes unread personal DMs above other unread chats when enabled", () => {
    const streamsMap = new Map<number, StreamEntryInternal>([
      [1, createStreamEntry(1, "General", 5000, 1)],
    ]);
    const dmsMap = new Map<string, DmEntryInternal>([
      ["42-alice", createDmEntry(42, "Alice", 1000, 1, false)],
    ]);

    const withoutFlag = sortChatsByLastMessage(streamsMap, dmsMap, new Set());
    expect(withoutFlag[0]?.type).toBe("stream");

    const withFlag = sortChatsByLastMessage(streamsMap, dmsMap, new Set(), {
      prioritizePersonalUnread: true,
    });
    expect(withFlag[0]?.type).toBe("dm");
  });

  it("prioritizes unread unmuted channels above muted unread channels when enabled", () => {
    const streamsMap = new Map<number, StreamEntryInternal>([
      [10, createStreamEntry(10, "Muted stream", 5000, 1)],
      [20, createStreamEntry(20, "Active stream", 1000, 1)],
    ]);
    const dmsMap = new Map<string, DmEntryInternal>();

    const withoutFlag = sortChatsByLastMessage(streamsMap, dmsMap, new Set([10]));
    expect(withoutFlag[0]).toMatchObject({ type: "stream", stream_id: 20 });

    const withFlag = sortChatsByLastMessage(streamsMap, dmsMap, new Set([10]), {
      prioritizeUnmutedUnreadChannels: true,
    });
    expect(withFlag[0]).toMatchObject({ type: "stream", stream_id: 20 });
  });

  it("excludes archived streams from sidebar projection", () => {
    const streamsMap = new Map<number, StreamEntryInternal>([
      [1, createStreamEntry(1, "Active", 2000, 1)],
      [2, createStreamEntry(2, "Archived", 3000, 1, true)],
    ]);

    const sorted = sortChatsByLastMessage(streamsMap, new Map(), new Set());
    expect(sorted).toHaveLength(1);
    expect(sorted[0]).toMatchObject({ type: "stream", stream_id: 1, name: "Active" });
  });

  it("hides streams with unknown archived status in strict mode", () => {
    const streamsMap = new Map<number, StreamEntryInternal>([
      [
        1,
        {
          ...createStreamEntry(1, "Known Active", 2000, 1, false),
          isArchived: false,
        },
      ],
      [
        2,
        {
          stream_id: 2,
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
    expect(sorted[0]).toMatchObject({ type: "stream", stream_id: 1, name: "Known Active" });
  });

  it("keeps streams with unknown archived status when strict mode is disabled", () => {
    const streamsMap = new Map<number, StreamEntryInternal>([
      [
        1,
        {
          ...createStreamEntry(1, "Known Active", 2000, 1, false),
          isArchived: false,
        },
      ],
      [
        2,
        {
          stream_id: 2,
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
    expect(sorted[0]).toMatchObject({ type: "stream", stream_id: 2, name: "Unknown" });
  });
});
