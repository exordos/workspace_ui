import { describe, expect, it } from "vitest";
import { parseRecentPrivateConversations } from "./zulip-recent-private-conversations.lib";

describe("parseRecentPrivateConversations", () => {
  it("parses Zulip array format from register", () => {
    const result = parseRecentPrivateConversations([
      {
        user_ids: [20],
        max_message_id: 900,
        unread_message_ids: [900],
      },
      {
        user_ids: [30, 40],
        max_message_id: 850,
        unread_message_ids: [],
      },
    ]);

    expect(result).toEqual({
      "20": {
        user_ids: [20],
        max_message_id: 900,
        unread_message_ids: [900],
      },
      "30,40": {
        user_ids: [30, 40],
        max_message_id: 850,
        unread_message_ids: [],
      },
    });
  });

  it("parses legacy string-keyed map format", () => {
    const result = parseRecentPrivateConversations({
      "10,20": {
        user_ids: [10, 20],
        max_message_id: 555,
        unread_message_ids: [551, 552],
      },
    });

    expect(result).toEqual({
      "10,20": {
        user_ids: [10, 20],
        max_message_id: 555,
        unread_message_ids: [551, 552],
      },
    });
  });

  it("returns null for invalid payload", () => {
    expect(parseRecentPrivateConversations("bad")).toBeNull();
    expect(parseRecentPrivateConversations(42)).toBeNull();
  });
});
