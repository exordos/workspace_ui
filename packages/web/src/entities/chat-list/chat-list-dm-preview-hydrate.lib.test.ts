import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useInstancesStore } from "~/entities/instance/instance.model";
import type { ZulipRecentPrivateConversation } from "~/shared/api/zulip.types";
import {
  collectLastMessageIdsFromRecentPrivateConversations,
  hydrateDmSidebarPreviewsFromRecentConversations,
} from "./chat-list-dm-preview-hydrate.lib";
import { useChatListStore } from "./chat-list.model";

function resetInstancesStore(): void {
  useInstancesStore.setState({
    instances: [],
    currentInstanceId: null,
    activeOrgEpoch: 0,
    unreadCountsByInstance: {},
    dmUnreadCountsByInstance: {},
    jitsiMeetBaseUrl: null,
  });
}

function seedActiveInstance(): string {
  return useInstancesStore.getState().addInstance().id;
}

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

describe("hydrateDmSidebarPreviewsFromRecentConversations", () => {
  beforeEach(() => {
    resetInstancesStore();
    seedActiveInstance();
    useChatListStore.getState().clear();
  });

  afterEach(() => {
    resetInstancesStore();
    useChatListStore.getState().clear();
  });

  it("does not fetch or apply DM previews from legacy metadata", async () => {
    await hydrateDmSidebarPreviewsFromRecentConversations({
      conversations: {
        a: { user_ids: [7, 20], max_message_id: 555, unread_message_ids: [] },
      },
      currentUserId: 7,
      instanceId: useInstancesStore.getState().currentInstanceId ?? undefined,
    });

    expect(useChatListStore.getState().dmsMap.size).toBe(0);
  });

  it("keeps no-op behavior when cancelled", async () => {
    await hydrateDmSidebarPreviewsFromRecentConversations({
      conversations: {
        a: { user_ids: [7, 20], max_message_id: 555, unread_message_ids: [] },
      },
      currentUserId: 7,
      instanceId: useInstancesStore.getState().currentInstanceId ?? undefined,
      cancelled: () => true,
    });

    expect(useChatListStore.getState().dmsMap.size).toBe(0);
  });
});
