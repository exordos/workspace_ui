// Тесты парсинга unread-ответа Zulip: и total count, и подробный snapshot.
import { describe, expect, it } from "vitest";
import {
  parseUnreadDmMessagesCount,
  parseUnreadMessagesCount,
  parseUnreadMessagesSnapshot,
} from "./zulip-unread.lib";

describe("parseUnreadMessagesCount", () => {
  it("prefers direct unread count when present", () => {
    const result = parseUnreadMessagesCount({
      unread_msgs: { count: 9, streams: [], pms: [], huddles: [], mentions: [] },
    });
    expect(result).toBe(9);
  });

  it("sums unread_message_ids buckets when direct count is missing", () => {
    const result = parseUnreadMessagesCount({
      unread_msgs: {
        streams: [{ unread_message_ids: [1, 2, 3] }],
        pms: [{ unread_message_ids: [4] }],
        huddles: [{ unread_message_ids: [5, 6] }],
        mentions: [{ unread_message_ids: [7] }],
      },
    });
    expect(result).toBe(7);
  });

  it("returns zero for valid empty payload", () => {
    const result = parseUnreadMessagesCount({
      unread_msgs: {
        streams: [],
        pms: [],
        huddles: [],
        mentions: [],
      },
    });
    expect(result).toBe(0);
  });

  it("returns null for invalid payload shape", () => {
    expect(parseUnreadMessagesCount(null)).toBeNull();
    expect(parseUnreadMessagesCount({})).toBeNull();
    expect(parseUnreadMessagesCount({ unread_msgs: [] })).toBeNull();
  });

  it("supports /messages payload and skips read-flagged entries", () => {
    const result = parseUnreadMessagesCount({
      messages: [{ id: 1, flags: [] }, { id: 2 }, { id: 3, flags: ["read"] }],
    });
    expect(result).toBe(2);
  });
});

describe("parseUnreadDmMessagesCount", () => {
  it("returns 1 when personal DMs have unread, ignoring streams/huddles", () => {
    const result = parseUnreadDmMessagesCount({
      unread_msgs: {
        count: 99,
        streams: [{ unread_message_ids: [1, 2, 3] }],
        pms: [{ sender_id: 20, unread_message_ids: [4, 5] }],
        huddles: [{ user_ids_string: "20,30", unread_message_ids: [6, 7, 8] }],
        mentions: [],
      },
    });
    expect(result).toBe(1);
  });

  it("prefers messages array over stale unread_msgs on combined payloads", () => {
    const result = parseUnreadDmMessagesCount({
      messages: [],
      unread_msgs: {
        count: 99,
        streams: [],
        pms: [{ sender_id: 20, unread_message_ids: [4, 5] }],
        huddles: [],
        mentions: [],
      },
    });
    expect(result).toBe(0);
  });

  it("ignores three-person huddles in /messages payload even when isGroup is not set", () => {
    const result = parseUnreadDmMessagesCount({
      messages: [
        {
          id: 1,
          type: "private",
          display_recipient: [
            { id: 7, full_name: "Me" },
            { id: 42, full_name: "Alice" },
            { id: 51, full_name: "Bob" },
          ],
        },
      ],
    });
    expect(result).toBe(0);
  });

  it("ignores stream and group DM messages in /messages payload", () => {
    const result = parseUnreadDmMessagesCount({
      messages: [
        { id: 1, type: "stream", stream_id: 10, subject: "bugs" },
        {
          id: 2,
          type: "private",
          display_recipient: [
            { id: 20, full_name: "Alice" },
            { id: 30, full_name: "Bob" },
            { id: 31, full_name: "Carol" },
          ],
        },
        {
          id: 3,
          type: "private",
          display_recipient: [
            { id: 40, full_name: "Dave" },
            { id: 50, full_name: "Eve" },
          ],
        },
      ],
    });
    expect(result).toBe(1);
  });

  it("returns 0 for valid empty personal DM payload", () => {
    expect(
      parseUnreadDmMessagesCount({
        unread_msgs: { streams: [], pms: [], huddles: [], mentions: [] },
      }),
    ).toBe(0);
  });
});

describe("parseUnreadMessagesSnapshot", () => {
  it("parses streams, pms and huddles buckets", () => {
    const result = parseUnreadMessagesSnapshot({
      unread_msgs: {
        count: 7,
        streams: [{ stream_id: 10, topic: "bugs", unread_message_ids: [1, 2] }],
        pms: [{ sender_id: 20, unread_message_ids: [3] }],
        huddles: [{ user_ids_string: "20,30", unread_message_ids: [4, 5] }],
        mentions: [{ unread_message_ids: [6, 7] }],
      },
    });

    expect(result).toEqual({
      totalCount: 7,
      streams: [{ streamId: 10, topic: "bugs", unreadMessageIds: [1, 2] }],
      dms: [
        { userIds: [20], unreadMessageIds: [3], isGroup: false },
        { userIds: [20, 30], unreadMessageIds: [4, 5], isGroup: true },
      ],
    });
  });

  it("filters invalid ids and keeps empty stream topic as empty", () => {
    const result = parseUnreadMessagesSnapshot({
      unread_msgs: {
        streams: [
          { stream_id: 10, topic: "", unread_message_ids: [1, -2, 0, "3"] },
          { stream_id: 0, topic: "ignored", unread_message_ids: [10] },
        ],
        pms: [{ sender_id: 20, unread_message_ids: [3, "4", -5] }],
        huddles: [{ user_ids_string: "20, x, 30, 20", unread_message_ids: [4, null, 5] }],
        mentions: [],
      },
    });

    expect(result).toEqual({
      totalCount: 5,
      streams: [{ streamId: 10, topic: "", unreadMessageIds: [1] }],
      dms: [
        { userIds: [20], unreadMessageIds: [3], isGroup: false },
        { userIds: [20, 30], unreadMessageIds: [4, 5], isGroup: true },
      ],
    });
  });

  it("returns zero total and empty buckets for valid empty payload", () => {
    const result = parseUnreadMessagesSnapshot({
      unread_msgs: {
        streams: [],
        pms: [],
        huddles: [],
        mentions: [],
      },
    });
    expect(result).toEqual({ totalCount: 0, streams: [], dms: [] });
  });

  it("returns null for invalid payload", () => {
    expect(parseUnreadMessagesSnapshot(null)).toBeNull();
    expect(parseUnreadMessagesSnapshot({})).toBeNull();
    expect(parseUnreadMessagesSnapshot({ unread_msgs: [] })).toBeNull();
    expect(parseUnreadMessagesSnapshot({ unread_msgs: { streams: [], pms: [] } })).toBeNull();
  });

  it("parses unread snapshot from /messages payload", () => {
    const result = parseUnreadMessagesSnapshot({
      messages: [
        { id: 1, type: "stream", stream_id: 10, subject: "bugs" },
        { id: 2, type: "stream", stream_id: 10, subject: "bugs" },
        {
          id: 3,
          type: "private",
          display_recipient: [
            { id: 20, full_name: "Alice" },
            { id: 30, full_name: "Bob" },
          ],
        },
        {
          id: 4,
          type: "private",
          display_recipient: [
            { id: 30, full_name: "Bob" },
            { id: 20, full_name: "Alice" },
          ],
        },
      ],
    });

    expect(result).toEqual({
      totalCount: 4,
      streams: [{ streamId: 10, topic: "bugs", unreadMessageIds: [1, 2] }],
      dms: [{ userIds: [20, 30], unreadMessageIds: [3, 4], isGroup: false }],
    });
  });

  it("filters invalid messages in /messages payload", () => {
    const result = parseUnreadMessagesSnapshot({
      messages: [
        { id: "1" },
        { id: 2, type: "stream", stream_id: 0, subject: "ignored" },
        { id: 3, type: "stream", stream_id: 10, subject: "" },
        { id: 4, type: "private", sender_id: 77, flags: ["read"] },
        { id: 5, type: "private", sender_id: 77 },
      ],
    });

    expect(result).toEqual({
      totalCount: 3,
      streams: [{ streamId: 10, topic: "", unreadMessageIds: [3] }],
      dms: [{ userIds: [77], unreadMessageIds: [5], isGroup: false }],
    });
  });
});
