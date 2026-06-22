import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useUsersStore } from "~/entities/user/user.model";
import { fetchMessagesByIds } from "~/shared/api/messenger-messages";
import type {
  MessengerRecentPrivateConversation,
  WorkspaceRawMessage,
} from "~/shared/api/messenger.types";
import { upsertDmIndexFromMessages } from "~/shared/lib/dm-index";
import { testMessageId } from "~/test/factories";
import {
  collectLastMessageIdsFromRecentPrivateConversations,
  hydrateDmSidebarPreviewsFromRecentConversations,
} from "./chat-list-dm-preview-hydrate.lib";
import { useChatListStore } from "./chat-list.model";

vi.mock("~/shared/api/messenger-messages", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/shared/api/messenger-messages")>();
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
const MESSAGE_ID_100 = testMessageId(100);
const MESSAGE_ID_200 = testMessageId(200);
const MESSAGE_ID_555 = testMessageId(555);

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

function seedActiveInstance(realm = "https://messenger.test"): string {
  return useInstancesStore.getState().addInstance({
    realm,
    login: "dm@example.com",
    authType: "iam",
    iamAccessToken: `key-${realm}`,
  }).id;
}

type WorkspaceRawMessageOverrides = Partial<Omit<WorkspaceRawMessage, "id">> & {
  id?: WorkspaceRawMessage["id"] | number;
};

function dmMessage(overrides: WorkspaceRawMessageOverrides = {}): WorkspaceRawMessage {
  const { id, ...rest } = overrides;
  return {
    id: testMessageId(id ?? 100),
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
    ...rest,
  };
}

describe("collectLastMessageIdsFromRecentPrivateConversations", () => {
  it("returns unique positive max_message_id values", () => {
    const conversations: Record<string, MessengerRecentPrivateConversation> = {
      a: { user_ids: [7, 20], max_message_id: MESSAGE_ID_100, unread_message_ids: [] },
      b: {
        user_ids: [7, 30],
        max_message_id: MESSAGE_ID_100,
        unread_message_ids: [testMessageId(1)],
      },
      c: { user_ids: [7, 40], max_message_id: MESSAGE_ID_200, unread_message_ids: [] },
    };

    expect(collectLastMessageIdsFromRecentPrivateConversations(conversations).sort()).toEqual([
      MESSAGE_ID_100,
      MESSAGE_ID_200,
    ]);
  });

  it("collects lastMessageId from metadata rows when register max_message_id is missing", () => {
    expect(
      collectLastMessageIdsFromRecentPrivateConversations(
        {
          a: { user_ids: [7, 20], max_message_id: null, unread_message_ids: [] },
        },
        [{ userIds: [7, 20], lastMessageId: MESSAGE_ID_555 }],
      ),
    ).toEqual([MESSAGE_ID_555]);
  });

  it("ignores null, invalid, and missing conversations", () => {
    const conversations: Record<string, MessengerRecentPrivateConversation> = {
      a: { user_ids: [7, 20], max_message_id: null, unread_message_ids: [] },
      b: { user_ids: [7, 30], max_message_id: "not-a-message-id", unread_message_ids: [] },
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
    fetchMessagesByIdsMock.mockResolvedValue([dmMessage({ id: MESSAGE_ID_555 })]);

    await hydrateDmSidebarPreviewsFromRecentConversations({
      conversations: {
        a: { user_ids: [7, 20], max_message_id: MESSAGE_ID_555, unread_message_ids: [] },
      },
      currentUserId: 7,
      instanceId: useInstancesStore.getState().currentInstanceId ?? undefined,
    });

    expect(fetchMessagesByIdsMock).toHaveBeenCalledWith([MESSAGE_ID_555]);
    expect(useChatListStore.getState().dmsMap.size).toBe(1);
    expect(upsertDmIndexFromMessagesMock).toHaveBeenCalledWith(
      expect.any(String),
      [expect.objectContaining({ id: MESSAGE_ID_555 })],
      7,
    );
  });

  it("drops stale DM preview results after organization switch", async () => {
    let resolveFetch!: (value: WorkspaceRawMessage[]) => void;
    fetchMessagesByIdsMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const pending = hydrateDmSidebarPreviewsFromRecentConversations({
      conversations: {
        a: { user_ids: [7, 20], max_message_id: MESSAGE_ID_555, unread_message_ids: [] },
      },
      currentUserId: 7,
      instanceId: useInstancesStore.getState().currentInstanceId ?? undefined,
    });

    const secondInstanceId = seedActiveInstance("https://messenger-2.test");
    useInstancesStore.getState().setCurrentInstanceId(secondInstanceId);
    useChatListStore.getState().clear();

    resolveFetch([dmMessage({ id: MESSAGE_ID_555, content: "stale dm preview" })]);
    await pending;

    expect(useChatListStore.getState().dmsMap.size).toBe(0);
    expect(upsertDmIndexFromMessagesMock).not.toHaveBeenCalled();
  });
});
