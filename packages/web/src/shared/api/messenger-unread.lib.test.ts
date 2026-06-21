// Tests for the messenger API unread response parsing: total count and detailed snapshot.
import { describe, expect, it } from "vitest";
import { testMessageId } from "~/test/factories";
import {
  parseUnreadDmMessagesCount,
  parseUnreadMessagesCount,
  parseUnreadMessagesSnapshot,
} from "./messenger-unread.lib";

const ids = (...values: number[]) => values.map(testMessageId);

describe("parseUnreadMessagesCount", () => {
  it("prefers direct unread count when present", () => {
    const result = parseUnreadMessagesCount({
      unread_msgs: { count: 9, streams: [], pms: [], huddles: [], mentions: [] },
    });
    expect(result).toBe(9);
  });

  it("sums unread_message_ids buckets when direct count is missing (huddles ignored)", () => {
    const result = parseUnreadMessagesCount({
      unread_msgs: {
        streams: [{ unread_message_ids: ids(1, 2, 3) }],
        pms: [{ unread_message_ids: ids(4) }],
        huddles: [{ unread_message_ids: ids(5, 6) }],
        mentions: [{ unread_message_ids: ids(7) }],
      },
    });
    expect(result).toBe(5);
  });

  it("uses other_user_id for pms buckets when present", () => {
    const result = parseUnreadMessagesSnapshot({
      unread_msgs: {
        streams: [],
        pms: [{ other_user_id: 42, unread_message_ids: ids(1, 2) }],
        huddles: [],
        mentions: [],
      },
    });
    expect(result?.dms).toEqual([{ userIds: [42], unreadMessageIds: ids(1, 2) }]);
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
      messages: [
        { id: testMessageId(1), flags: [] },
        { id: testMessageId(2) },
        { id: testMessageId(3), flags: ["read"] },
      ],
    });
    expect(result).toBe(2);
  });
});

describe("parseUnreadDmMessagesCount", () => {
  it("returns 1 when personal DMs have unread, ignoring streams/huddles", () => {
    const result = parseUnreadDmMessagesCount({
      unread_msgs: {
        count: 99,
        streams: [{ unread_message_ids: ids(1, 2, 3) }],
        pms: [{ sender_id: 20, unread_message_ids: ids(4, 5) }],
        huddles: [{ user_ids_string: "20,30", unread_message_ids: ids(6, 7, 8) }],
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
        pms: [{ sender_id: 20, unread_message_ids: ids(4, 5) }],
        huddles: [],
        mentions: [],
      },
    });
    expect(result).toBe(0);
  });

  it("ignores three-person huddles in /messages payload", () => {
    const result = parseUnreadDmMessagesCount({
      messages: [
        {
          id: testMessageId(1),
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

  it("returns 1 when register mentions bucket has unread ids", () => {
    const result = parseUnreadDmMessagesCount({
      unread_msgs: {
        streams: [],
        pms: [],
        huddles: [],
        mentions: [{ unread_message_ids: ids(9) }],
      },
    });
    expect(result).toBe(1);
  });

  it("ignores stream and group DM messages in /messages payload", () => {
    const result = parseUnreadDmMessagesCount({
      messages: [
        { id: testMessageId(1), type: "stream", stream_id: 10, subject: "bugs" },
        {
          id: testMessageId(2),
          type: "private",
          display_recipient: [
            { id: 20, full_name: "Alice" },
            { id: 30, full_name: "Bob" },
            { id: 31, full_name: "Carol" },
          ],
        },
        {
          id: testMessageId(3),
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
  it("parses streams and pms buckets and ignores huddles", () => {
    const result = parseUnreadMessagesSnapshot({
      unread_msgs: {
        count: 7,
        streams: [{ stream_id: 10, topic: "bugs", unread_message_ids: ids(1, 2) }],
        pms: [{ sender_id: 20, unread_message_ids: ids(3) }],
        huddles: [{ user_ids_string: "20,30", unread_message_ids: ids(4, 5) }],
        mentions: [{ unread_message_ids: ids(6, 7) }],
      },
    });

    expect(result).toEqual({
      totalCount: 7,
      streams: [{ streamId: 10, topic: "bugs", unreadMessageIds: ids(1, 2) }],
      dms: [{ userIds: [20], unreadMessageIds: ids(3) }],
      mentionMessageIds: ids(6, 7),
    });
  });

  it("filters invalid ids and keeps empty stream topic as empty", () => {
    const result = parseUnreadMessagesSnapshot({
      unread_msgs: {
        streams: [
          { stream_id: 10, topic: "", unread_message_ids: [testMessageId(1), -2, 0, "3"] },
          { stream_id: 0, topic: "ignored", unread_message_ids: ids(10) },
        ],
        pms: [{ sender_id: 20, unread_message_ids: [testMessageId(3), "4", -5] }],
        huddles: [
          {
            user_ids_string: "20, x, 30, 20",
            unread_message_ids: [testMessageId(4), null, testMessageId(5)],
          },
        ],
        mentions: [],
      },
    });

    expect(result).toEqual({
      totalCount: 3,
      streams: [{ streamId: 10, topic: "", unreadMessageIds: ids(1) }],
      dms: [{ userIds: [20], unreadMessageIds: ids(3) }],
      mentionMessageIds: [],
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
    expect(result).toEqual({ totalCount: 0, streams: [], dms: [], mentionMessageIds: [] });
  });

  it("returns null for invalid payload", () => {
    expect(parseUnreadMessagesSnapshot(null)).toBeNull();
    expect(parseUnreadMessagesSnapshot({})).toBeNull();
    expect(parseUnreadMessagesSnapshot({ unread_msgs: [] })).toBeNull();
    // streams or pms not an array → invalid
    expect(parseUnreadMessagesSnapshot({ unread_msgs: { streams: [] } })).toBeNull();
  });

  it("parses unread snapshot from /messages payload", () => {
    const result = parseUnreadMessagesSnapshot({
      messages: [
        { id: testMessageId(1), type: "stream", stream_id: 10, subject: "bugs" },
        { id: testMessageId(2), type: "stream", stream_id: 10, subject: "bugs" },
        {
          id: testMessageId(3),
          type: "private",
          display_recipient: [
            { id: 20, full_name: "Alice" },
            { id: 30, full_name: "Bob" },
          ],
        },
        {
          id: testMessageId(4),
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
      streams: [{ streamId: 10, topic: "bugs", unreadMessageIds: ids(1, 2) }],
      dms: [{ userIds: [20, 30], unreadMessageIds: ids(3, 4) }],
      mentionMessageIds: [],
    });
  });

  it("filters invalid messages in /messages payload", () => {
    const result = parseUnreadMessagesSnapshot({
      messages: [
        { id: "not-a-message-id" },
        { id: testMessageId(2), type: "stream", stream_id: 0, subject: "ignored" },
        { id: testMessageId(3), type: "stream", stream_id: 10, subject: "" },
        { id: testMessageId(4), type: "private", sender_id: 77, flags: ["read"] },
        { id: testMessageId(5), type: "private", sender_id: 77 },
      ],
    });

    expect(result).toEqual({
      totalCount: 3,
      streams: [{ streamId: 10, topic: "", unreadMessageIds: ids(3) }],
      dms: [{ userIds: [77], unreadMessageIds: ids(5) }],
      mentionMessageIds: [],
    });
  });
});
