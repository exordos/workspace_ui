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
import { DEFAULT_REGISTER_FETCH_EVENT_TYPES } from "~/shared/api/zulip-queue";
import { loadUsersDirectoryRow } from "~/shared/lib/users-directory-snapshot-db";
import { createInstance, createMessage } from "~/test/factories";
import { useLayoutZulipEventLoop } from "./layout-zulip-event-loop.hook";
import type { ChatListBootstrapResult } from "./layout-chat-list-bootstrap.lib";

const startZulipEventLoopMock = vi.hoisted(() => vi.fn());
const fetchUsersMock = vi.hoisted(() => vi.fn(() => Promise.resolve([])));
const fetchSubscriptionsMock = vi.hoisted(() => vi.fn(() => Promise.resolve([])));
const getCurrentUserMock = vi.hoisted(() => vi.fn(() => Promise.resolve({ user_id: 7 })));
const deleteQueueMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const fetchDirectMessagesPageMock = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ messages: [], foundOldest: true })),
);
const hydrateDmSidebarPreviewsMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const requestUserStatusMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const loadDmIndexEntriesMock = vi.hoisted(() =>
  vi.fn<
    () => {
      dmKey: string;
      userIds: number[];
      lastActivityTs: number;
      lastMessageId: number;
      unreadCount: number;
    }[]
  >(() => []),
);

vi.mock("~/shared/lib/event-loop", () => ({
  startZulipEventLoop: startZulipEventLoopMock,
}));

vi.mock("~/shared/lib/connection-health", () => ({
  cancelScheduledReconnect: vi.fn(),
  registerManualReconnectListener: vi.fn(() => vi.fn()),
  reportFailure: vi.fn(),
  reportSuccess: vi.fn(),
  scheduleReconnect: vi.fn(),
  setConnectionPhase: vi.fn(),
}));

vi.mock("~/shared/api/zulip-queue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/shared/api/zulip-queue")>();
  return {
    ...actual,
    deleteQueue: deleteQueueMock,
  };
});

vi.mock("~/shared/api/zulip-sidebar-preview.lib", () => ({
  fetchDirectMessagesPage: fetchDirectMessagesPageMock,
}));

vi.mock("~/shared/api/zulip-streams", () => ({
  fetchSubscriptions: fetchSubscriptionsMock,
}));

vi.mock("~/shared/api/zulip-users", () => ({
  fetchUsers: fetchUsersMock,
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("~/entities/user/api/user.api", () => ({
  requestUserStatus: requestUserStatusMock,
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

  useLayoutZulipEventLoop({
    currentInstanceId,
    loadBootstrapMessages,
    loadMuteSnapshot,
    setFromMessages,
    setCurrentUserId,
    setCurrentUserStatus,
  });
  return null;
}

describe("useLayoutZulipEventLoop", () => {
  beforeEach(() => {
    hydrateDmSidebarPreviewsMock.mockClear();
    requestUserStatusMock.mockClear();
    loadDmIndexEntriesMock.mockReset();
    loadDmIndexEntriesMock.mockReturnValue([]);
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
        createInstance({
          id: "inst-1",
          realm: "https://zulip.example.com",
          email: "test@example.com",
        }),
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

  it("reconciles stale sidebar unread counts from register unread_msgs snapshot", async () => {
    const props = createHarnessProps();
    props.loadBootstrapMessages.mockResolvedValue({
      mode: "streamPreviews",
      messages: [
        {
          id: 101,
          sender_id: 20,
          sender_full_name: "Notifier",
          content: "rename",
          timestamp: 1000,
          type: "stream",
          stream_id: 12,
          display_recipient: "engineering",
          subject: "channel events",
          flags: ["unread"],
        },
      ],
      latestMessageIdHint: null,
    });

    render(<Harness currentInstanceId="inst-1" props={props} />);

    await waitFor(() => {
      expect(startZulipEventLoopMock).toHaveBeenCalledTimes(1);
    });

    const onQueueRegistered = (
      startZulipEventLoopMock.mock.calls[0]?.[0] as {
        onQueueRegistered?: (
          id: string,
          registration?: {
            unread_snapshot?: {
              streams: { streamId: number; topic: string; unreadMessageIds: number[] }[];
              dms: unknown[];
              totalCount: number;
            };
            subscriptions?: { stream_id: number; name: string }[];
          },
        ) => void;
      }
    )?.onQueueRegistered;

    act(() => {
      onQueueRegistered?.("q-stale-unread", {
        subscriptions: [{ stream_id: 12, name: "engineering" }],
        unread_snapshot: {
          streams: [{ streamId: 12, topic: "channel events", unreadMessageIds: [] }],
          dms: [],
          totalCount: 0,
        },
      });
    });

    await waitFor(() => {
      expect(
        useChatListStore.getState().streamsMap.get(12)?.topics.get("channel events")?.unreadCount,
      ).toBe(0);
    });
  });

  it("applies register unread snapshot to sidebar ordering and preview", async () => {
    const props = createHarnessProps();
    props.loadBootstrapMessages.mockResolvedValue({
      mode: "streamPreviews",
      messages: [
        {
          id: 201,
          sender_id: 20,
          sender_full_name: "Older Sender",
          content: "older stream preview",
          timestamp: 1000,
          type: "stream",
          stream_id: 12,
          display_recipient: "engineering",
          subject: "legacy topic",
          flags: ["read"],
        },
        {
          id: 202,
          sender_id: 21,
          sender_full_name: "Baseline Sender",
          content: "baseline preview",
          timestamp: 3000,
          type: "stream",
          stream_id: 20,
          display_recipient: "design",
          subject: "baseline topic",
          flags: ["read"],
        },
        {
          id: 203,
          sender_id: 20,
          sender_full_name: "Fresh Sender",
          content: "fresh unread preview",
          timestamp: 9000,
          type: "stream",
          stream_id: 12,
          display_recipient: "engineering",
          subject: "incident response",
          flags: [],
        },
      ],
      latestMessageIdHint: null,
    });

    render(<Harness currentInstanceId="inst-1" props={props} />);

    await waitFor(() => {
      expect(startZulipEventLoopMock).toHaveBeenCalledTimes(1);
    });

    const onQueueRegistered = (
      startZulipEventLoopMock.mock.calls[0]?.[0] as {
        onQueueRegistered?: (
          id: string,
          registration?: {
            unread_snapshot?: {
              streams: { streamId: number; topic: string; unreadMessageIds: number[] }[];
              dms: unknown[];
              totalCount: number;
            };
            subscriptions?: { stream_id: number; name: string }[];
          },
        ) => void;
      }
    )?.onQueueRegistered;

    act(() => {
      onQueueRegistered?.("q-preview-order", {
        subscriptions: [
          { stream_id: 12, name: "engineering" },
          { stream_id: 20, name: "design" },
        ],
        unread_snapshot: {
          streams: [{ streamId: 12, topic: "incident response", unreadMessageIds: [203] }],
          dms: [],
          totalCount: 1,
        },
      });
    });

    await waitFor(() => {
      expect(useChatListStore.getState().streams()[0]!.stream_id).toBe(12);
    });

    const stream = useChatListStore.getState().streamsMap.get(12);
    expect(stream?.lastMessage).toContain("fresh unread preview");
    expect(stream?.topics.get("incident response")?.lastMessageId).toBe(203);
    expect(stream?.topics.get("incident response")?.unreadCount).toBe(1);
  });

  it("starts Zulip event loop after bootstrap settles", async () => {
    render(<Harness currentInstanceId="inst-1" />);

    await waitFor(() => {
      expect(startZulipEventLoopMock).toHaveBeenCalledTimes(1);
    });
    expect(fetchSubscriptionsMock).toHaveBeenCalledTimes(1);

    const firstCallArg = startZulipEventLoopMock.mock.calls[0]?.[0] as
      | { fetchEventTypes?: string[] }
      | undefined;
    expect(firstCallArg?.fetchEventTypes).toEqual([
      ...DEFAULT_REGISTER_FETCH_EVENT_TYPES,
      "starred_messages",
    ]);
    expect(firstCallArg?.fetchEventTypes).toContain("user_status");
    expect(firstCallArg?.fetchEventTypes).toContain("starred_messages");
  });

  it("marks stream metadata as hydrated after bootstrap subscriptions success, even if empty", async () => {
    render(<Harness currentInstanceId="inst-1" />);

    await waitFor(() => {
      expect(startZulipEventLoopMock).toHaveBeenCalledTimes(1);
    });

    expect(useChatListStore.getState().streamMetadataHydrated).toBe(true);
  });

  it("does not mark stream metadata as hydrated when subscriptions bootstrap fails", async () => {
    fetchSubscriptionsMock.mockRejectedValueOnce(new Error("subscriptions failed"));
    const props = createHarnessProps();

    render(<Harness currentInstanceId="inst-1" props={props} />);

    await waitFor(() => {
      expect(props.setCurrentUserStatus).toHaveBeenCalled();
    });
    expect(startZulipEventLoopMock).not.toHaveBeenCalled();
    expect(useChatListStore.getState().streamMetadataHydrated).toBe(false);
  });

  it("still starts the event loop when users directory IndexedDB read fails", async () => {
    vi.mocked(loadUsersDirectoryRow).mockRejectedValueOnce(new Error("idb failed"));
    const props = createHarnessProps();

    render(<Harness currentInstanceId="inst-1" props={props} />);

    await waitFor(() => {
      expect(startZulipEventLoopMock).toHaveBeenCalledTimes(1);
    });
    expect(props.setCurrentUserStatus).not.toHaveBeenCalledWith("blocked");
  });

  it("stores modern realm add-subscribers group from register metadata", async () => {
    render(<Harness currentInstanceId="inst-1" />);

    await waitFor(() => {
      expect(startZulipEventLoopMock).toHaveBeenCalledTimes(1);
    });

    const firstCallArg = startZulipEventLoopMock.mock.calls[0]?.[0] as
      | {
          onQueueRegistered?: (
            id: string,
            registration?: {
              realm_can_add_subscribers_group?: number;
            },
          ) => void;
        }
      | undefined;

    act(() => {
      firstCallArg?.onQueueRegistered?.("q-1", {
        realm_can_add_subscribers_group: 14,
      });
    });

    expect(useUsersStore.getState().currentUserChannelCapabilities).toEqual({
      realmCanAddSubscribersGroup: 14,
    });
  });

  it("sets starred summary count from register message ids", async () => {
    render(<Harness currentInstanceId="inst-1" />);

    await waitFor(() => {
      expect(startZulipEventLoopMock).toHaveBeenCalledTimes(1);
    });

    const firstCallArg = startZulipEventLoopMock.mock.calls[0]?.[0] as
      | {
          onQueueRegistered?: (
            id: string,
            registration?: {
              starred_message_ids?: number[];
            },
          ) => void;
        }
      | undefined;

    act(() => {
      firstCallArg?.onQueueRegistered?.("q-starred", {
        starred_message_ids: [11, 12, 13],
      });
    });

    expect(useActivityStore.getState().starredSummary).toEqual(
      expect.objectContaining({
        count: 3,
        isCapped: false,
        stale: false,
      }),
    );
  });

  it("resolves current user from /users when /users/me returns null", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null as unknown as { user_id: number });
    fetchUsersMock.mockResolvedValueOnce([
      { user_id: 7, full_name: "Test User", email: "test@example.com" },
    ] as never);
    const props = createHarnessProps();

    render(<Harness currentInstanceId="inst-1" props={props} />);

    await waitFor(() => {
      expect(props.setCurrentUserStatus).toHaveBeenCalledWith("ready");
    });
    expect(props.setCurrentUserId).toHaveBeenCalledWith(7);
    await waitFor(() => {
      expect(startZulipEventLoopMock).toHaveBeenCalledTimes(1);
    });
    expect(useInstancesStore.getState().instances[0]?.userId).toBe(7);
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
        lastMessageId: 55,
        unreadCount: 0,
      },
    ]);

    render(<Harness currentInstanceId="inst-1" />);

    await waitFor(() => {
      expect(startZulipEventLoopMock).toHaveBeenCalledTimes(1);
    });
    expect(requestUserStatusMock).not.toHaveBeenCalled();
  });

  it("hydrates known user statuses from register snapshot without fallback requests", async () => {
    fetchUsersMock.mockResolvedValueOnce([
      { user_id: 7, full_name: "Current User", email: "test@example.com" },
      { user_id: 20, full_name: "Partner", email: "partner@example.com" },
    ] as never);

    render(<Harness currentInstanceId="inst-1" />);

    await waitFor(() => {
      expect(startZulipEventLoopMock).toHaveBeenCalledTimes(1);
    });

    const firstCallArg = startZulipEventLoopMock.mock.calls[0]?.[0] as
      | {
          onQueueRegistered?: (
            id: string,
            registration?: {
              userStatusSnapshot?: {
                userId: number;
                status: {
                  text: string;
                  emojiName?: string;
                  emojiCode?: string;
                  reactionType?: "unicode_emoji";
                  away: boolean;
                };
              }[];
            },
          ) => void;
        }
      | undefined;

    act(() => {
      firstCallArg?.onQueueRegistered?.("q-status", {
        userStatusSnapshot: [
          {
            userId: 20,
            status: {
              text: "Heads down",
              emojiName: "speech_balloon",
              emojiCode: "1f4ac",
              reactionType: "unicode_emoji",
              away: true,
            },
          },
        ],
      });
    });

    const partner = useUsersStore.getState().getUser(20);
    expect(partner?.status).toEqual({
      text: "Heads down",
      emojiName: "speech_balloon",
      emojiCode: "1f4ac",
      reactionType: "unicode_emoji",
      away: true,
    });
    expect(partner?.statusFetchedAt).toEqual(expect.any(Number));
    expect(requestUserStatusMock).not.toHaveBeenCalled();
  });

  it("clears stale user statuses when register snapshot is present but empty", async () => {
    fetchUsersMock.mockResolvedValueOnce([
      { user_id: 7, full_name: "Current User", email: "test@example.com" },
      { user_id: 20, full_name: "Partner", email: "partner@example.com" },
    ] as never);

    render(<Harness currentInstanceId="inst-1" />);

    await waitFor(() => {
      expect(startZulipEventLoopMock).toHaveBeenCalledTimes(1);
    });

    useUsersStore.getState().setStatus(20, { text: "Old status", away: false }, 123);

    const firstCallArg = startZulipEventLoopMock.mock.calls[0]?.[0] as
      | {
          onQueueRegistered?: (
            id: string,
            registration?: {
              userStatusSnapshot?: {
                userId: number;
                status: { text: string; away: boolean };
              }[];
            },
          ) => void;
        }
      | undefined;

    act(() => {
      firstCallArg?.onQueueRegistered?.("q-empty-status", {
        userStatusSnapshot: [],
      });
    });

    const partner = useUsersStore.getState().getUser(20);
    expect(partner?.status).toBeUndefined();
    expect(partner?.statusFetchedAt).toEqual(expect.any(Number));
  });

  it("does not clear statuses when register snapshot field is absent", async () => {
    fetchUsersMock.mockResolvedValueOnce([
      { user_id: 7, full_name: "Current User", email: "test@example.com" },
      { user_id: 20, full_name: "Partner", email: "partner@example.com" },
    ] as never);

    render(<Harness currentInstanceId="inst-1" />);

    await waitFor(() => {
      expect(startZulipEventLoopMock).toHaveBeenCalledTimes(1);
    });

    useUsersStore.getState().setStatus(20, { text: "Keep me", away: false }, 123);

    const firstCallArg = startZulipEventLoopMock.mock.calls[0]?.[0] as
      | {
          onQueueRegistered?: (id: string, registration?: Record<string, unknown>) => void;
        }
      | undefined;

    act(() => {
      firstCallArg?.onQueueRegistered?.("q-no-status", {});
    });

    expect(useUsersStore.getState().getUser(20)?.status).toEqual({
      text: "Keep me",
      away: false,
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
    getCurrentUserMock.mockResolvedValueOnce({ user_id: 7 });

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

  it("reconciles sidebar unread from register after metadata rows are applied", async () => {
    const reconcileSpy = vi.spyOn(useChatListStore.getState(), "reconcileUnreadFromSnapshot");
    const props = createHarnessProps();
    props.setCurrentUserId.mockImplementation((id: number) => {
      useChatListStore.getState().setCurrentUserId(id);
    });

    render(<Harness currentInstanceId="inst-1" props={props} />);

    await waitFor(() => {
      expect(startZulipEventLoopMock).toHaveBeenCalledTimes(1);
    });

    const firstCallArg = startZulipEventLoopMock.mock.calls[0]?.[0] as
      | {
          onQueueRegistered?: (
            id: string,
            registration?: {
              unread_snapshot?: {
                streams: unknown[];
                dms: unknown[];
                totalCount: number;
              };
              recent_private_conversations?: Record<
                string,
                { user_ids: number[]; max_message_id: number | null; unread_message_ids: number[] }
              >;
              subscriptions?: { stream_id: number; name: string }[];
            },
          ) => void;
        }
      | undefined;

    reconcileSpy.mockClear();
    useChatListStore.getState().clear();
    useChatListStore.getState().setCurrentUserId(7);

    act(() => {
      firstCallArg?.onQueueRegistered?.("q-unread", {
        subscriptions: [{ stream_id: 12, name: "engineering" }],
        unread_snapshot: {
          streams: [{ streamId: 12, topic: "incidents", unreadMessageIds: [401, 402] }],
          dms: [{ userIds: [20], unreadMessageIds: [501], isGroup: false }],
          totalCount: 3,
        },
        recent_private_conversations: {
          "7,20": {
            user_ids: [7, 20],
            max_message_id: 900,
            unread_message_ids: [501],
          },
        },
      });
    });

    await waitFor(() => {
      expect(reconcileSpy).toHaveBeenCalled();
    });

    expect(
      useChatListStore.getState().streamsMap.get(12)?.topics.get("incidents")?.unreadCount,
    ).toBe(2);
    expect(useChatListStore.getState().dmsMap.get("7,20")?.unreadCount).toBe(1);
    reconcileSpy.mockRestore();
  });

  it("hydrates DM previews from recent_private_conversations when metadata bootstrap is enabled", async () => {
    const props = createHarnessProps();
    props.setCurrentUserId.mockImplementation((id: number) => {
      useChatListStore.getState().setCurrentUserId(id);
    });

    render(<Harness currentInstanceId="inst-1" props={props} />);

    await waitFor(() => {
      expect(startZulipEventLoopMock).toHaveBeenCalledTimes(1);
    });

    const firstCallArg = startZulipEventLoopMock.mock.calls[0]?.[0] as
      | {
          onQueueRegistered?: (
            id: string,
            registration?: {
              recent_private_conversations?: Record<
                string,
                { user_ids: number[]; max_message_id: number | null; unread_message_ids: number[] }
              >;
            },
          ) => void;
        }
      | undefined;

    act(() => {
      firstCallArg?.onQueueRegistered?.("q-dm", {
        recent_private_conversations: {
          "7,20": {
            user_ids: [7, 20],
            max_message_id: 900,
            unread_message_ids: [900],
          },
        },
      });
    });

    await waitFor(() => {
      expect(hydrateDmSidebarPreviewsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          currentUserId: 7,
          conversations: {
            "7,20": {
              user_ids: [7, 20],
              max_message_id: 900,
              unread_message_ids: [900],
            },
          },
          metadataRows: [
            expect.objectContaining({
              userIds: [7, 20],
              lastMessageId: 900,
            }),
          ],
        }),
      );
    });
    expect(fetchDirectMessagesPageMock).not.toHaveBeenCalled();
  });

  it("skips stale register apply after instance switch", async () => {
    useInstancesStore.setState((state) => ({
      ...state,
      instances: [
        ...state.instances,
        createInstance({
          id: "inst-2",
          realm: "https://zulip-2.example.com",
          email: "test-2@example.com",
        }),
      ],
    }));

    const view = render(<Harness currentInstanceId="inst-1" />);

    await waitFor(() => {
      expect(startZulipEventLoopMock).toHaveBeenCalledTimes(1);
    });

    const staleOnQueueRegistered = (
      startZulipEventLoopMock.mock.calls[0]?.[0] as {
        onQueueRegistered?: (
          id: string,
          registration?: {
            subscriptions?: { stream_id: number; name: string }[];
            recent_private_conversations?: Record<
              string,
              { user_ids: number[]; max_message_id: number | null; unread_message_ids: number[] }
            >;
          },
        ) => void;
      }
    )?.onQueueRegistered;

    act(() => {
      useInstancesStore.getState().setCurrentInstanceId("inst-2");
    });
    view.rerender(<Harness currentInstanceId="inst-2" />);

    await waitFor(() => {
      expect(startZulipEventLoopMock).toHaveBeenCalledTimes(2);
    });

    act(() => {
      staleOnQueueRegistered?.("q-stale-switch", {
        subscriptions: [{ stream_id: 44, name: "stale-stream" }],
        recent_private_conversations: {
          "7,20": {
            user_ids: [7, 20],
            max_message_id: 900,
            unread_message_ids: [900],
          },
        },
      });
    });

    expect(useChatListStore.getState().streamsMap.has(44)).toBe(false);
    expect(useChatListStore.getState().dmsMap.has("7,20")).toBe(false);
    expect(hydrateDmSidebarPreviewsMock).not.toHaveBeenCalled();
  });

  it("skips stale register apply after layout unmount", async () => {
    const view = render(<Harness currentInstanceId="inst-1" />);

    await waitFor(() => {
      expect(startZulipEventLoopMock).toHaveBeenCalledTimes(1);
    });

    const staleOnQueueRegistered = (
      startZulipEventLoopMock.mock.calls[0]?.[0] as {
        onQueueRegistered?: (
          id: string,
          registration?: {
            subscriptions?: { stream_id: number; name: string }[];
            recent_private_conversations?: Record<
              string,
              { user_ids: number[]; max_message_id: number | null; unread_message_ids: number[] }
            >;
          },
        ) => void;
      }
    )?.onQueueRegistered;

    view.unmount();

    act(() => {
      staleOnQueueRegistered?.("q-stale-unmount", {
        subscriptions: [{ stream_id: 45, name: "ghost-stream" }],
        recent_private_conversations: {
          "7,30": {
            user_ids: [7, 30],
            max_message_id: 901,
            unread_message_ids: [901],
          },
        },
      });
    });

    expect(useChatListStore.getState().streamsMap.has(45)).toBe(false);
    expect(useChatListStore.getState().dmsMap.has("7,30")).toBe(false);
    expect(hydrateDmSidebarPreviewsMock).not.toHaveBeenCalled();
  });

  it("marks stream metadata as hydrated on queue register even without subscriptions payload", async () => {
    render(<Harness currentInstanceId="inst-1" />);

    await waitFor(() => {
      expect(startZulipEventLoopMock).toHaveBeenCalledTimes(1);
    });

    useChatListStore.getState().setStreamMetadataHydrated(false);
    const firstCallArg = startZulipEventLoopMock.mock.calls[0]?.[0] as
      | {
          onQueueRegistered?: (
            id: string,
            registration?: {
              realm_can_add_subscribers_group?: number;
            },
          ) => void;
        }
      | undefined;
    act(() => {
      firstCallArg?.onQueueRegistered?.("q-1", {
        realm_can_add_subscribers_group: 14,
      });
    });

    expect(useChatListStore.getState().streamMetadataHydrated).toBe(true);
  });

  it("clears messenger shell state when active instance becomes null", async () => {
    const view = render(<Harness currentInstanceId="inst-1" />);

    useUsersStore.getState().mergeUser({ user_id: 1, full_name: "Alice" });
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
          key: "stream:10:bugs",
          streamId: 10,
          streamName: "engineering",
          topic: "bugs",
          senderId: null,
          senderName: null,
          dmSlug: null,
          unreadCount: 1,
          lastMessageTimestamp: 1000,
          messageIds: [77],
        },
      ],
    });
    useChatListStore.setState({
      currentUserId: 7,
      streamsMap: new Map([
        [
          10,
          {
            stream_id: 10,
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
      streamId: 10,
      streamName: "engineering",
      topic: "bugs",
      streamWideView: false,
    });
    useCurrentChatMessagesStore.getState().setMessages([
      createMessage({
        id: 88,
        stream_id: 10,
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
      messageId: 88,
      requestVersion: 1,
    });
    useMuteStore.getState().muteStream(10);
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
