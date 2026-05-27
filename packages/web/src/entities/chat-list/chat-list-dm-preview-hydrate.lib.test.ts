import { describe, expect, it } from "vitest";
import type { ZulipRecentPrivateConversation } from "~/shared/api/zulip.types";
import { collectLastMessageIdsFromRecentPrivateConversations } from "./chat-list-dm-preview-hydrate.lib";

describe("collectLastMessageIdsFromRecentPrivateConversations", () => {
  it("returns unique positive max_message_id values", () => {
    const conversations: Record<string, ZulipRecentPrivateConversation> = {
      a: { user_ids: [7, 20], max_message_id: 100, unread_message_ids: [] },
      b: { user_ids: [7, 30], max_message_id: 100, unread_message_ids: [1] },
      c: { user_ids: [7, 40], max_message_id: 200, unread_message_ids: [] },
    };

    expect(
      collectLastMessageIdsFromRecentPrivateConversations(conversations).sort((a, b) => a - b),
    ).toEqual([100, 200]);
  });

  it("collects lastMessageId from metadata rows when register max_message_id is missing", () => {
    expect(
      collectLastMessageIdsFromRecentPrivateConversations(
        {
          a: { user_ids: [7, 20], max_message_id: null, unread_message_ids: [] },
        },
        [{ userIds: [7, 20], lastMessageId: 555 }],
      ),
    ).toEqual([555]);
  });

  it("ignores null, zero, and missing conversations", () => {
    const conversations: Record<string, ZulipRecentPrivateConversation> = {
      a: { user_ids: [7, 20], max_message_id: null, unread_message_ids: [] },
      b: { user_ids: [7, 30], max_message_id: 0, unread_message_ids: [] },
    };

    expect(collectLastMessageIdsFromRecentPrivateConversations(conversations)).toEqual([]);
    expect(collectLastMessageIdsFromRecentPrivateConversations(undefined)).toEqual([]);
  });
});
