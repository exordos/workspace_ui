import { describe, expect, it } from "vitest";
import type { DmEntryInternal, StreamEntryInternal } from "~/shared/types/sidebar-chat";
import {
  computeSidebarUnreadTotals,
  computeSidebarUnreadTotalsWithMute,
  countMentionsUnread,
} from "./chat-list-sidebar-totals.lib";

describe("chat-list-sidebar-totals", () => {
  it("computeSidebarUnreadTotals sums server stream and dm unread", () => {
    const streamsMap = new Map<string, StreamEntryInternal>([
      [
        "11111111-1111-4111-8111-111111111111",
        {
          streamUuid: "11111111-1111-4111-8111-111111111111",
          name: "general",
          lastMessage: "",
          time: "",
          ts: 0,
          unreadCount: 2,
          topics: new Map([
            [
              "a",
              {
                subject: "a",
                lastMessage: "",
                time: "",
                ts: 0,
                unreadCount: 9,
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

  it("computeSidebarUnreadTotalsWithMute excludes muted streams from server stream unread", () => {
    const mutedStreamUuid = "11111111-1111-4111-8111-111111111111";
    const openStreamUuid = "22222222-2222-4222-8222-222222222222";
    const streamsMap = new Map<string, StreamEntryInternal>([
      [
        mutedStreamUuid,
        {
          streamUuid: mutedStreamUuid,
          name: "muted",
          lastMessage: "",
          time: "",
          ts: 0,
          unreadCount: 5,
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
        openStreamUuid,
        {
          streamUuid: openStreamUuid,
          name: "engineering",
          lastMessage: "",
          time: "",
          ts: 0,
          unreadCount: 2,
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
          lastMessage: "",
          time: "",
          ts: 0,
          unreadCount: 4,
        },
      ],
    ]);

    expect(
      computeSidebarUnreadTotalsWithMute(streamsMap, dmsMap, {
        isStreamMuted: (streamId) => streamId === mutedStreamUuid,
        isEffectivelyMuted: (streamId, topic) =>
          streamId === openStreamUuid && topic === "muted-topic",
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
          {
            id: "00000000-0000-4000-8000-000000000001",
            sender_id: 10,
            content: "",
            timestamp: 0,
            flags: ["mentioned"],
          },
          {
            id: "00000000-0000-4000-8000-000000000002",
            sender_id: 10,
            content: "",
            timestamp: 0,
            flags: ["mentioned"],
            read: true,
          },
          {
            id: "00000000-0000-4000-8000-000000000003",
            sender_id: 11,
            content: "",
            timestamp: 0,
            flags: ["mentioned"],
            read: true,
          },
          {
            id: "00000000-0000-4000-8000-000000000004",
            sender_id: 11,
            content: "",
            timestamp: 0,
            flags: ["mentioned"],
          },
        ],
        10,
      ),
    ).toBe(1);
  });
});
