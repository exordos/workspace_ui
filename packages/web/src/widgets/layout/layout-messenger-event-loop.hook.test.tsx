import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useActivityStore } from "~/entities/activity/activity.model";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInboxStore } from "~/entities/inbox/inbox.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import { useNotificationSettingsStore } from "~/entities/notification-settings/notification-settings.model";
import { useUsersStore } from "~/entities/user/user.model";
import { useUserGroupsStore } from "~/entities/user-group/user-group.model";
import { useMessageReadersStore } from "~/features/message-readers/message-readers.model";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import { useUserProfileStore } from "~/features/user-profile/user-profile.model";
import type { MessageId } from "~/shared/lib/message-id.lib";
import { loadUsersDirectoryRow } from "~/shared/lib/users-directory-snapshot-db";
import { createMessage } from "~/test/factories";
import { useLayoutMessengerEventLoop } from "./layout-messenger-event-loop.hook";
import type { ChatListBootstrapResult } from "./layout-chat-list-bootstrap.lib";

const startMessengerEventLoopMock = vi.hoisted(() => vi.fn());
const fetchUsersMock = vi.hoisted(() => vi.fn(() => Promise.resolve([])));
const fetchMyStreamsMock = vi.hoisted(() => vi.fn(() => Promise.resolve([])));
const fetchStreamTopicsMock = vi.hoisted(() => vi.fn(() => Promise.resolve([])));
const getCurrentUserMock = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ user_id: "00000000-0000-0000-0000-000000000000" })),
);
const fetchDirectMessagesPageMock = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ messages: [], foundOldest: true })),
);
const hydrateDmSidebarPreviewsMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const loadDmIndexEntriesMock = vi.hoisted(() =>
  vi.fn<
    () => {
      dmKey: string;
      userIds: number[];
      lastActivityTs: number;
      lastMessageId: MessageId;
      unreadCount: number;
    }[]
  >(() => []),
);

vi.mock("~/shared/lib/event-loop", () => ({
  startMessengerEventLoop: startMessengerEventLoopMock,
}));

vi.mock("~/shared/lib/connection-health", () => ({
  cancelScheduledReconnect: vi.fn(),
  registerManualReconnectListener: vi.fn(() => vi.fn()),
  reportFailure: vi.fn(),
  reportSuccess: vi.fn(),
  scheduleReconnect: vi.fn(),
  setConnectionPhase: vi.fn(),
}));

vi.mock("~/shared/api/messenger-sidebar-preview.lib", () => ({
  fetchDirectMessagesPage: fetchDirectMessagesPageMock,
}));

vi.mock("~/shared/api/messenger-streams", () => ({
  fetchMyStreams: fetchMyStreamsMock,
  fetchStreamTopics: fetchStreamTopicsMock,
}));

vi.mock("~/shared/api/messenger-users", () => ({
  fetchUsers: fetchUsersMock,
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("~/entities/chat-list/chat-list-dm-preview-hydrate.lib", () => ({
  hydrateDmSidebarPreviewsFromRecentConversations: hydrateDmSidebarPreviewsMock,
}));

vi.mock("~/shared/lib/mute-snapshot-db", () => ({
  loadMuteSnapshotRow: vi.fn(() => Promise.resolve(null)),
  persistMuteSnapshotRow: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock("~/shared/lib/users-directory-snapshot-db", () => ({
  loadUsersDirectoryRow: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("~/entities/user/user-directory-snapshot-persist.lib", () => ({
  persistUsersDirectoryToIndexedDb: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock("~/shared/lib/dm-index", () => ({
  loadDmIndexEntries: loadDmIndexEntriesMock,
  upsertDmIndexEntries: vi.fn(),
  upsertDmIndexFromMessages: vi.fn(),
}));

function createHarnessProps() {
  return {
    loadBootstrapMessages: vi.fn<
      (signal: AbortSignal, isStale: () => boolean) => Promise<ChatListBootstrapResult>
    >(() => Promise.resolve({ mode: "none", latestMessageIdHint: null })),
    loadMuteSnapshot: vi.fn(() =>
      Promise.resolve({
        mutedStreamIds: [],
        mutedTopics: [],
        unmutedTopics: [],
        followedTopics: [],
        streamDesktopNotifyEnabledIds: [],
        streamDesktopNotifyDisabledIds: [],
        streamAudibleNotifyEnabledIds: [],
        streamAudibleNotifyDisabledIds: [],
      }),
    ),
    setFromMessages: vi.fn(),
    setCurrentUserId: vi.fn(),
    setCurrentUserStatus: vi.fn(),
  };
}

function Harness({
  currentInstanceId,
  props = createHarnessProps(),
}: {
  currentInstanceId: string | null;
  props?: ReturnType<typeof createHarnessProps>;
}) {
  const {
    loadBootstrapMessages,
    loadMuteSnapshot,
    setFromMessages,
    setCurrentUserId,
    setCurrentUserStatus,
  } = props;

  useLayoutMessengerEventLoop({
    currentInstanceId,
    loadBootstrapMessages,
    loadMuteSnapshot,
    setFromMessages,
    setCurrentUserId,
    setCurrentUserStatus,
  });
  return null;
}

describe("useLayoutMessengerEventLoop", () => {
  beforeEach(() => {
    hydrateDmSidebarPreviewsMock.mockClear();
    loadDmIndexEntriesMock.mockReset();
    loadDmIndexEntriesMock.mockReturnValue([]);
    fetchStreamTopicsMock.mockReset();
    fetchStreamTopicsMock.mockResolvedValue([]);
    useActivityStore.getState().clear();
    useChatListStore.getState().clear();
    useInboxStore.getState().clear();
    useCurrentChatMessagesStore.getState().setContext(null);
    useCurrentChatMessagesStore.getState().setMessages([]);
    useNotificationSettingsStore.getState().clear();
    useUsersStore.getState().clear();
    useUserGroupsStore.getState().clear();
    useMessageReadersStore.getState().clear();
    useMuteStore.getState().clear();
    useUserProfileStore.getState().clear();
    useInstancesStore.setState({
      instances: [
        {
          id: "inst-1",
          realm: "https://chat.example.com",
          login: "test@example.com",
          authType: "iam",
          iamAccessToken: "access-token",
        },
      ],
      currentInstanceId: "inst-1",
      unreadCountsByInstance: {},
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    useActivityStore.getState().clear();
    useChatListStore.getState().clear();
    useInboxStore.getState().clear();
    useCurrentChatMessagesStore.getState().setContext(null);
    useCurrentChatMessagesStore.getState().setMessages([]);
    useNotificationSettingsStore.getState().clear();
    useUsersStore.getState().clear();
    useUserGroupsStore.getState().clear();
    useMessageReadersStore.getState().clear();
    useMuteStore.getState().clear();
    useUserProfileStore.getState().clear();
    useInstancesStore.setState({
      instances: [],
      currentInstanceId: null,
      unreadCountsByInstance: {},
    });
  });

  it("starts messenger event loop after bootstrap settles", async () => {
    render(<Harness currentInstanceId="inst-1" />);

    await waitFor(() => {
      expect(startMessengerEventLoopMock).toHaveBeenCalledTimes(1);
    });
    expect(fetchMyStreamsMock).toHaveBeenCalledTimes(1);

    const firstCallArg = startMessengerEventLoopMock.mock.calls[0]?.[0] as
      | { enabled?: boolean; fetchEventTypes?: string[]; onQueueRegistered?: unknown }
      | undefined;
    expect(firstCallArg?.enabled).toBe(false);
    expect(firstCallArg?.fetchEventTypes).toBeUndefined();
    expect(firstCallArg?.onQueueRegistered).toBeUndefined();
  });

  it("marks stream metadata as hydrated after bootstrap subscriptions success, even if empty", async () => {
    render(<Harness currentInstanceId="inst-1" />);

    await waitFor(() => {
      expect(startMessengerEventLoopMock).toHaveBeenCalledTimes(1);
    });

    expect(useChatListStore.getState().streamMetadataHydrated).toBe(true);
  });

  it("hydrates private stream metadata from /streams into Personal", async () => {
    const streamUuid = "1bce03ca-d6d9-4fdb-82cb-7ec05fa7a8e9";
    const currentUserUuid = "00000000-0000-0000-0000-000000000000";
    fetchMyStreamsMock.mockResolvedValueOnce([
      {
        uuid: streamUuid,
        name: "Alice Smith",
        description: "",
        stream_uuid: streamUuid,
        user_uuid: currentUserUuid,
        last_synced_at: "2026-06-20T16:30:19.824219Z",
        invite_only: false,
        announce: false,
        private: true,
      },
    ] as never);

    render(<Harness currentInstanceId="inst-1" />);

    await waitFor(() => {
      expect(startMessengerEventLoopMock).toHaveBeenCalledTimes(1);
    });

    expect(useChatListStore.getState().streamsMap.get(streamUuid)).toEqual(
      expect.objectContaining({
        name: "Alice Smith",
        private: true,
        streamUuid,
      }),
    );
  });

  it("does not mark stream metadata as hydrated when /streams bootstrap fails", async () => {
    fetchMyStreamsMock.mockRejectedValueOnce(new Error("streams failed"));
    const props = createHarnessProps();

    render(<Harness currentInstanceId="inst-1" props={props} />);

    await waitFor(() => {
      expect(props.setCurrentUserStatus).toHaveBeenCalled();
    });
    expect(startMessengerEventLoopMock).not.toHaveBeenCalled();
    expect(useChatListStore.getState().streamMetadataHydrated).toBe(false);
  });

  it("still starts the event loop when users directory IndexedDB read fails", async () => {
    vi.mocked(loadUsersDirectoryRow).mockRejectedValueOnce(new Error("idb failed"));
    const props = createHarnessProps();

    render(<Harness currentInstanceId="inst-1" props={props} />);

    await waitFor(() => {
      expect(startMessengerEventLoopMock).toHaveBeenCalledTimes(1);
    });
    expect(props.setCurrentUserStatus).not.toHaveBeenCalledWith("blocked");
  });

  it("does not resolve current user from directory when token user lookup fails", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null as unknown as { user_id: string });
    fetchUsersMock.mockResolvedValueOnce([
      {
        user_id: "00000000-0000-0000-0000-000000000000",
        full_name: "Test User",
        email: "test@example.com",
      },
    ] as never);
    const props = createHarnessProps();

    render(<Harness currentInstanceId="inst-1" props={props} />);

    await waitFor(() => {
      expect(props.setCurrentUserStatus).toHaveBeenCalledWith("blocked");
    });
    expect(props.setCurrentUserId).not.toHaveBeenCalled();
    expect(startMessengerEventLoopMock).toHaveBeenCalledTimes(1);
  });

  it("does not preload bootstrap statuses for users directory members", async () => {
    fetchUsersMock.mockResolvedValueOnce([
      { user_id: 7, full_name: "Current User", email: "test@example.com" },
      { user_id: 20, full_name: "Partner", email: "partner@example.com" },
      { user_id: 30, full_name: "Teammate", email: "teammate@example.com" },
    ] as never);
    loadDmIndexEntriesMock.mockReturnValueOnce([
      {
        dmKey: "7,20",
        userIds: [7, 20],
        lastActivityTs: 100,
        lastMessageId: "00000000-0000-4000-8000-000000000055",
        unreadCount: 0,
      },
    ]);

    render(<Harness currentInstanceId="inst-1" />);

    await waitFor(() => {
      expect(startMessengerEventLoopMock).toHaveBeenCalledTimes(1);
    });
  });

  it("does not let a superseded bootstrap run set blocked after ready", async () => {
    const props = createHarnessProps();
    let resolveUsers!: (members: never[]) => void;
    fetchUsersMock.mockImplementationOnce(
      () =>
        new Promise<never[]>((resolve) => {
          resolveUsers = resolve;
        }),
    );
    getCurrentUserMock.mockResolvedValueOnce({ user_id: "00000000-0000-0000-0000-000000000000" });

    const { unmount } = render(<Harness currentInstanceId="inst-1" props={props} />);

    await waitFor(() => {
      expect(props.setCurrentUserStatus).toHaveBeenCalledWith("ready");
    });

    unmount();
    resolveUsers([]);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(props.setCurrentUserStatus).not.toHaveBeenCalledWith("blocked");
  });

  it("clears messenger shell state when active instance becomes null", async () => {
    const streamUuid = "00000000-0000-4000-8000-000000000010";
    const currentUserUuid = "00000000-0000-0000-0000-000000000000";
    const view = render(<Harness currentInstanceId="inst-1" />);

    useUsersStore.getState().mergeUser({ user_id: currentUserUuid, full_name: "Alice" });
    useActivityStore.setState((state) => ({
      filters: {
        ...state.filters,
        mentions: {
          ...state.filters.mentions,
          messages: [createMessage({ id: 77, content: "Mention from org A" })],
        },
      },
    }));
    useInboxStore.setState({
      entries: [
        {
          key: "stream:" + streamUuid + ":bugs",
          streamId: streamUuid,
          streamName: "engineering",
          topic: "bugs",
          senderId: null,
          senderName: null,
          dmSlug: null,
          unreadCount: 1,
          lastMessageTimestamp: 1000,
          messageIds: ["00000000-0000-4000-8000-000000000077"],
        },
      ],
    });
    useChatListStore.setState({
      currentUserId: currentUserUuid,
      streamsMap: new Map([
        [
          streamUuid,
          {
            streamUuid,
            name: "engineering",
            lastMessage: "Mention from org A",
            time: "",
            ts: 1000,
            topics: new Map(),
          },
        ],
      ]),
    });
    useCurrentChatMessagesStore.getState().setContext({
      type: "stream",
      streamId: streamUuid,
      streamName: "engineering",
      topic: "bugs",
      streamWideView: false,
    });
    useCurrentChatMessagesStore.getState().setMessages([
      createMessage({
        id: "00000000-0000-4000-8000-000000000088",
        stream_uuid: streamUuid,
        subject: "bugs",
        content: "Current chat message",
        type: "stream",
        display_recipient: "engineering",
      }),
    ]);
    useMessageReadersStore.setState({
      loading: false,
      userIds: [1],
      error: null,
      messageId: "00000000-0000-4000-8000-000000000088",
      requestVersion: 1,
    });
    useMuteStore.getState().muteStream(streamUuid);
    useNotificationSettingsStore.getState().setFromServer({ enable_desktop_notifications: false });
    useUserProfileStore.setState({
      profile: {
        userId: 1,
        fullName: "Alice",
        email: "alice@example.com",
        avatarUrl: "",
        role: 400,
      },
      status: "done",
      error: null,
      requestVersion: 1,
    });

    view.rerender(<Harness currentInstanceId={null} />);

    await waitFor(() => {
      expect(useUsersStore.getState().users.size).toBe(0);
      expect(useActivityStore.getState().filters.mentions.messages).toEqual([]);
      expect(useInboxStore.getState().entries).toEqual([]);
      expect(useChatListStore.getState().streamsMap.size).toBe(0);
      expect(useCurrentChatMessagesStore.getState().context).toBeNull();
      expect(useCurrentChatMessagesStore.getState().messages).toEqual([]);
      expect(useMessageReadersStore.getState().messageId).toBeNull();
      expect(useMuteStore.getState().mutedStreamIds.size).toBe(0);
      expect(useNotificationSettingsStore.getState().hydrated).toBe(false);
      expect(useUserProfileStore.getState().profile).toBeNull();
    });
  });
});
