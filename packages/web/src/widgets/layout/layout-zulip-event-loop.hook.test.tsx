import { act, render, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useUsersStore } from "~/entities/user/user.model";
import { useUserGroupsStore } from "~/entities/user-group/user-group.model";
import { DEFAULT_REGISTER_FETCH_EVENT_TYPES } from "~/shared/api/zulip-queue";
import { loadUsersDirectoryRow } from "~/shared/lib/users-directory-snapshot-db";
import { useLayoutZulipEventLoop } from "./layout-zulip-event-loop.hook";

const startZulipEventLoopMock = vi.hoisted(() => vi.fn());
const fetchUsersMock = vi.hoisted(() => vi.fn(() => Promise.resolve([])));
const fetchSubscriptionsMock = vi.hoisted(() => vi.fn(() => Promise.resolve([])));
const getCurrentUserMock = vi.hoisted(() => vi.fn(() => Promise.resolve({ user_id: 7 })));
const deleteQueueMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const fetchDirectMessagesPageMock = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ messages: [], foundOldest: true })),
);

vi.mock("~/shared/lib/event-loop", () => ({
  startZulipEventLoop: startZulipEventLoopMock,
}));

vi.mock("~/shared/api/zulip", () => ({
  deleteQueue: deleteQueueMock,
  fetchDirectMessagesPage: fetchDirectMessagesPageMock,
  fetchSubscriptions: fetchSubscriptionsMock,
  fetchUsers: fetchUsersMock,
  getCurrentUser: getCurrentUserMock,
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
  loadDmIndexEntries: vi.fn(() => []),
  upsertDmIndexEntries: vi.fn(),
  upsertDmIndexFromMessages: vi.fn(),
}));

function createHarnessProps() {
  return {
    loadBootstrapMessages: vi.fn<
      (
        signal: AbortSignal,
        isStale: () => boolean,
      ) => Promise<{ mode: "none"; latestMessageIdHint: number | null }>
    >(() => Promise.resolve({ mode: "none", latestMessageIdHint: null })),
    loadMuteSnapshot: vi.fn<
      () => Promise<{
        mutedStreamIds: number[];
        mutedTopics: { streamId: number; topic: string }[];
        unmutedTopics: { streamId: number; topic: string }[];
        followedTopics: { streamId: number; topic: string }[];
      }>
    >(() =>
      Promise.resolve({
        mutedStreamIds: [],
        mutedTopics: [],
        unmutedTopics: [],
        followedTopics: [],
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
    useChatListStore.getState().clear();
    useUsersStore.getState().clear();
    useUserGroupsStore.getState().clear();
    useInstancesStore.setState({
      instances: [
        {
          id: "inst-1",
          realm: "https://zulip.example.com",
          email: "test@example.com",
          apiKey: "api-key",
        },
      ],
      currentInstanceId: "inst-1",
      unreadCountsByInstance: {},
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    useChatListStore.getState().clear();
    useUsersStore.getState().clear();
    useUserGroupsStore.getState().clear();
    useInstancesStore.setState({
      instances: [],
      currentInstanceId: null,
      unreadCountsByInstance: {},
    });
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
    expect(firstCallArg?.fetchEventTypes).toEqual([...DEFAULT_REGISTER_FETCH_EVENT_TYPES]);
  });

  it("still starts the event loop when users directory IndexedDB read fails", async () => {
    vi.mocked(loadUsersDirectoryRow).mockRejectedValueOnce(new Error("idb failed"));
    const props = createHarnessProps();

    render(<Harness currentInstanceId="inst-1" props={props} />);

    await waitFor(() => {
      expect(startZulipEventLoopMock).toHaveBeenCalledTimes(1);
    });
    expect(props.setCurrentUserStatus).not.toHaveBeenCalledWith("error");
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
});
