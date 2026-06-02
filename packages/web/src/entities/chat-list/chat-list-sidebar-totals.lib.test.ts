import { describe, expect, it } from "vitest";
import type { DmEntryInternal, StreamEntryInternal } from "~/shared/types/sidebar-chat";
import {
  applySidebarUnreadDeltas,
  computeSidebarUnreadTotals,
  computeSidebarUnreadTotalsWithMute,
  countMentionsUnread,
} from "./chat-list-sidebar-totals.lib";

describe("chat-list-sidebar-totals", () => {
  it("computeSidebarUnreadTotals sums topic and dm unread", () => {
    const streamsMap = new Map<number, StreamEntryInternal>([
      [
        1,
        {
          stream_id: 1,
          name: "general",
          lastMessage: "",
          time: "",
          ts: 0,
          topics: new Map([
            [
              "a",
              {
                subject: "a",
                lastMessage: "",
                time: "",
                ts: 0,
                unreadCount: 2,
              },
            ],
            [
              "b",
              {
                subject: "b",
                lastMessage: "",
                time: "",
                ts: 0,
                unreadCount: 0,
              },
            ],
          ]),
        },
      ],
    ]);
    const dmsMap = new Map<string, DmEntryInternal>([
      [
        "10,20",
        {
          id: 20,
          name: "Bob",
          slug: "bob",
          isGroup: false,
          lastMessage: "",
          time: "",
          ts: 0,
          unreadCount: 3,
        },
      ],
    ]);
    expect(computeSidebarUnreadTotals(streamsMap, dmsMap)).toEqual({
      sidebarStreamsUnread: 2,
      sidebarDmsUnread: 3,
    });
  });

  it("applySidebarUnreadDeltas adjusts cached totals", () => {
    expect(
      applySidebarUnreadDeltas(
        { sidebarStreamsUnread: 4, sidebarDmsUnread: 2 },
        { streams: 3, dms: -1 },
      ),
    ).toEqual({ sidebarStreamsUnread: 7, sidebarDmsUnread: 1 });
  });

  it("computeSidebarUnreadTotalsWithMute excludes muted streams and topics", () => {
    const streamsMap = new Map<number, StreamEntryInternal>([
      [
        10,
        {
          stream_id: 10,
          name: "muted",
          lastMessage: "",
          time: "",
          ts: 0,
          topics: new Map([
            [
              "release",
              {
                subject: "release",
                lastMessage: "",
                time: "",
                ts: 0,
                unreadCount: 5,
              },
            ],
          ]),
        },
      ],
      [
        20,
        {
          stream_id: 20,
          name: "engineering",
          lastMessage: "",
          time: "",
          ts: 0,
          topics: new Map([
            [
              "muted-topic",
              {
                subject: "muted-topic",
                lastMessage: "",
                time: "",
                ts: 0,
                unreadCount: 3,
              },
            ],
            [
              "open-topic",
              {
                subject: "open-topic",
                lastMessage: "",
                time: "",
                ts: 0,
                unreadCount: 2,
              },
            ],
          ]),
        },
      ],
    ]);
    const dmsMap = new Map<string, DmEntryInternal>([
      [
        "42",
        {
          id: 42,
          name: "Alice",
          slug: "42-alice",
          isGroup: false,
          lastMessage: "",
          time: "",
          ts: 0,
          unreadCount: 4,
        },
      ],
    ]);

    expect(
      computeSidebarUnreadTotalsWithMute(streamsMap, dmsMap, {
        isStreamMuted: (streamId) => streamId === 10,
        isEffectivelyMuted: (streamId, topic) => streamId === 20 && topic === "muted-topic",
      }),
    ).toEqual({
      sidebarStreamsUnread: 2,
      sidebarDmsUnread: 4,
    });
  });

  it("countMentionsUnread skips own messages and read mentions", () => {
    expect(
      countMentionsUnread(
        [
          { id: 1, sender_id: 10, content: "", timestamp: 0, flags: ["mentioned"] },
          { id: 2, sender_id: 10, content: "", timestamp: 0, flags: ["mentioned", "read"] },
          { id: 3, sender_id: 11, content: "", timestamp: 0, flags: ["mentioned", "read"] },
          { id: 4, sender_id: 11, content: "", timestamp: 0, flags: ["mentioned"] },
        ],
        10,
      ),
    ).toBe(1);
  });
});
