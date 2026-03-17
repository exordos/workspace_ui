import { describe, expect, it } from "vitest";
import type { DmEntryInternal, StreamEntryInternal } from "~/shared/types/sidebar-chat";
import { sortChatsByLastMessage } from "./chat-sorting";

function createStreamEntry(
  stream_id: number,
  name: string,
  ts: number,
  unreadCount: number,
): StreamEntryInternal {
  return {
    stream_id,
    name,
    lastMessage: `${name} message`,
    time: "10:00",
    ts,
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
  it("prioritizes unread personal DMs above other unread chats when enabled", () => {
    const streamsMap = new Map<number, StreamEntryInternal>([
      [1, createStreamEntry(1, "General", 5000, 1)],
    ]);
    const dmsMap = new Map<string, DmEntryInternal>([
      ["42-alice", createDmEntry(42, "Alice", 1000, 1, false)],
    ]);

    const withoutFlag = sortChatsByLastMessage(streamsMap, dmsMap, "recent", new Set());
    expect(withoutFlag[0]?.type).toBe("stream");

    const withFlag = sortChatsByLastMessage(streamsMap, dmsMap, "recent", new Set(), {
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

    const withoutFlag = sortChatsByLastMessage(streamsMap, dmsMap, "recent", new Set([10]));
    expect(withoutFlag[0]).toMatchObject({ type: "stream", stream_id: 10 });

    const withFlag = sortChatsByLastMessage(streamsMap, dmsMap, "recent", new Set([10]), {
      prioritizeUnmutedUnreadChannels: true,
    });
    expect(withFlag[0]).toMatchObject({ type: "stream", stream_id: 20 });
  });

  it("keeps alphabetical ordering behavior for alphabetical mode", () => {
    const streamsMap = new Map<number, StreamEntryInternal>([
      [2, createStreamEntry(2, "Zulu", 2000, 1)],
    ]);
    const dmsMap = new Map<string, DmEntryInternal>([
      ["1-alpha", createDmEntry(1, "Alpha", 1000, 1, false)],
    ]);

    const sorted = sortChatsByLastMessage(streamsMap, dmsMap, "alphabetical", new Set(), {
      prioritizePersonalUnread: true,
      prioritizeUnmutedUnreadChannels: true,
    });
    expect(sorted[0]).toMatchObject({ type: "dm", name: "Alpha" });
    expect(sorted[1]).toMatchObject({ type: "stream", name: "Zulu" });
  });
});
