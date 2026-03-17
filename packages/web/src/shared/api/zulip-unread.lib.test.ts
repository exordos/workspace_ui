import { describe, expect, it } from "vitest";
import { parseUnreadMessagesCount } from "./zulip-unread.lib";

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
});
