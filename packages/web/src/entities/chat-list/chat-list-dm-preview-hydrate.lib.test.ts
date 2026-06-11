import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useUsersStore } from "~/entities/user/user.model";
import { fetchMessagesByIds } from "~/shared/api/zulip-messages";
import type { ZulipRecentPrivateConversation, ZulipRawMessage } from "~/shared/api/zulip.types";
import { upsertDmIndexFromMessages } from "~/shared/lib/dm-index";
import { useChatListStore } from "./chat-list.model";
import {
  collectLastMessageIdsFromRecentPrivateConversations,
  hydrateDmSidebarPreviewsFromRecentConversations,
} from "./chat-list-dm-preview-hydrate.lib";

vi.mock("~/shared/api/zulip-messages", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/shared/api/zulip-messages")>();
  return {
    ...actual,
    fetchMessagesByIds: vi.fn(),
  };
});

vi.mock("~/shared/lib/dm-index", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/shared/lib/dm-index")>();
  return {
    ...actual,
    upsertDmIndexFromMessages: vi.fn(),
  };
});

const fetchMessagesByIdsMock = vi.mocked(fetchMessagesByIds);
const upsertDmIndexFromMessagesMock = vi.mocked(upsertDmIndexFromMessages);

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

function seedActiveInstance(realm = "https://zulip.test"): string {
  return useInstancesStore.getState().addInstance({
    realm,
    email: "dm@example.com",
    apiKey: `key-${realm}`,
  }).id;
}

function dmMessage(overrides: Partial<ZulipRawMessage> = {}): ZulipRawMessage {
  return {
    id: 100,
    sender_id: 20,
    sender_full_name: "DM Sender",
    content: "hello",
    timestamp: 1000,
    type: "private",
    display_recipient: [
      { id: 7, full_name: "Current User" },
      { id: 20, full_name: "Other User" },
    ],
    flags: [],
    ...overrides,
  };
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
    useUsersStore.getState().clear();
    fetchMessagesByIdsMock.mockReset();
    upsertDmIndexFromMessagesMock.mockReset();
  });

  afterEach(() => {
    resetInstancesStore();
    useChatListStore.getState().clear();
    useUsersStore.getState().clear();
  });

  it("applies fetched DM previews to chat list and DM index", async () => {
    fetchMessagesByIdsMock.mockResolvedValue([dmMessage({ id: 555 })]);

    await hydrateDmSidebarPreviewsFromRecentConversations({
      conversations: {
        a: { user_ids: [7, 20], max_message_id: 555, unread_message_ids: [] },
      },
      currentUserId: 7,
      instanceId: useInstancesStore.getState().currentInstanceId ?? undefined,
    });

    expect(fetchMessagesByIdsMock).toHaveBeenCalledWith([555]);
    expect(useChatListStore.getState().dmsMap.size).toBe(1);
    expect(upsertDmIndexFromMessagesMock).toHaveBeenCalledWith(
      expect.any(String),
      [expect.objectContaining({ id: 555 })],
      7,
    );
  });

  it("drops stale DM preview results after organization switch", async () => {
    let resolveFetch!: (value: ZulipRawMessage[]) => void;
    fetchMessagesByIdsMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const pending = hydrateDmSidebarPreviewsFromRecentConversations({
      conversations: {
        a: { user_ids: [7, 20], max_message_id: 555, unread_message_ids: [] },
      },
      currentUserId: 7,
      instanceId: useInstancesStore.getState().currentInstanceId ?? undefined,
    });

    const secondInstanceId = seedActiveInstance("https://zulip-2.test");
    useInstancesStore.getState().setCurrentInstanceId(secondInstanceId);
    useChatListStore.getState().clear();

    resolveFetch([dmMessage({ id: 555, content: "stale dm preview" })]);
    await pending;

    expect(useChatListStore.getState().dmsMap.size).toBe(0);
    expect(upsertDmIndexFromMessagesMock).not.toHaveBeenCalled();
  });
});
