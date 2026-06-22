import { describe, expect, it } from "vitest";
import { testMessageId } from "~/test/factories";
import { parseRecentPrivateConversations } from "./messenger-recent-private-conversations.lib";

const ids = (...values: number[]) => values.map(testMessageId);

describe("parseRecentPrivateConversations", () => {
  it("parses Workspace array format from register", () => {
    const result = parseRecentPrivateConversations([
      {
        user_ids: [20],
        max_message_id: testMessageId(900),
        unread_message_ids: ids(900),
      },
      {
        user_ids: [30, 40],
        max_message_id: testMessageId(850),
        unread_message_ids: [],
      },
    ]);

    expect(result).toEqual({
      "20": {
        user_ids: [20],
        max_message_id: testMessageId(900),
        unread_message_ids: ids(900),
      },
      "30,40": {
        user_ids: [30, 40],
        max_message_id: testMessageId(850),
        unread_message_ids: [],
      },
    });
  });

  it("ignores non-array payloads", () => {
    expect(
      parseRecentPrivateConversations({
        "10,20": {
          user_ids: [10, 20],
          max_message_id: testMessageId(555),
          unread_message_ids: ids(551, 552),
        },
      }),
    ).toBeNull();
  });

  it("returns null for invalid payload", () => {
    expect(parseRecentPrivateConversations("bad")).toBeNull();
    expect(parseRecentPrivateConversations(42)).toBeNull();
  });
});
