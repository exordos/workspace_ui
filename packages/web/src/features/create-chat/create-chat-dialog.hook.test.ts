import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useUsersStore } from "~/entities/user/user.model";
import { useUserGroupsStore } from "~/entities/user-group/user-group.model";
import { fetchStreams, fetchSubscriptions } from "~/shared/api/messenger-streams";
import { useCreateChatDialog } from "./create-chat-dialog.hook";
import {
  createChannel,
  subscribeCurrentUserToStream,
  unarchiveChannel,
  unsubscribeChannel,
} from "./create-chat.api";

vi.mock("./create-chat.api", () => ({
  createChannel: vi.fn(),
  unarchiveChannel: vi.fn(),
  subscribeCurrentUserToStream: vi.fn(),
  unsubscribeChannel: vi.fn(),
}));

vi.mock("~/shared/api/messenger-streams", () => ({
  fetchStreams: vi.fn(),
  fetchSubscriptions: vi.fn(),
}));

vi.mock("~/shared/api/messenger-users", () => ({
  fetchUsers: vi.fn(() => Promise.resolve([])),
}));

const STREAM_UUID_5 = "00000000-0000-4000-8000-000000000005";
const STREAM_UUID_6 = "00000000-0000-4000-8000-000000000006";
const STREAM_UUID_7 = "00000000-0000-4000-8000-000000000007";
const CURRENT_USER_UUID = "00000000-0000-0000-0000-000000000010";
const ALICE_UUID = "00000000-0000-0000-0000-000000000001";
const BOB_UUID = "00000000-0000-0000-0000-000000000003";

function defaultHookOptions(overrides: Partial<Parameters<typeof useCreateChatDialog>[0]> = {}) {
  return {
    open: true,
    onNavigateStream: vi.fn(),
    onChannelCreated: vi.fn(),
    ...overrides,
  };
}

function seedUsers(): void {
  useUsersStore.getState().mergeUsers([
    { user_id: CURRENT_USER_UUID, full_name: "Current User", email: "me@example.com" },
    { user_id: ALICE_UUID, full_name: "Alice", email: "alice@example.com" },
    { user_id: BOB_UUID, full_name: "Bob", email: "bob@example.com" },
  ]);
}

function seedSystemGroups(): void {
  useUserGroupsStore.getState().setGroups([
    {
      id: 11,
      name: "role:administrators",
      members: [],
      direct_subgroup_ids: [],
      is_system_group: true,
    },
    {
      id: 12,
      name: "role:moderators",
      members: [],
      direct_subgroup_ids: [],
      is_system_group: true,
    },
  ]);
}

describe("useCreateChatDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUsersStore.getState().clear();
    useChatListStore.getState().clear();
    useUserGroupsStore.getState().clear();
  });

  afterEach(() => {
    useUsersStore.getState().clear();
    useChatListStore.getState().clear();
    useUserGroupsStore.getState().clear();
  });

  it("passes selected users only when creating channel", async () => {
    seedUsers();
    useChatListStore.setState({ currentUserId: CURRENT_USER_UUID });
    vi.mocked(createChannel).mockResolvedValue({
      streamUuid: "00000000-0000-4000-8000-000000000055",
    });
    const onChannelCreated = vi.fn();

    const { result } = renderHook(() =>
      useCreateChatDialog(defaultHookOptions({ onChannelCreated })),
    );

    act(() => {
      result.current.setChannelName("  engineering  ");
      result.current.toggleChannelUser(BOB_UUID);
      result.current.toggleChannelUser(ALICE_UUID);
      result.current.toggleChannelUser(CURRENT_USER_UUID);
    });

    act(() => {
      result.current.createChannel();
    });

    await waitFor(() => {
      expect(createChannel).toHaveBeenCalledTimes(1);
    });

    // Creator binding is server-owned; client sends only selected non-creator members.
    expect(createChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "engineering",
        subscribers: [ALICE_UUID, BOB_UUID],
      }),
    );

    await waitFor(() => {
      expect(onChannelCreated).toHaveBeenCalledTimes(1);
    });
  });

  it("allows channel creation when current user ID is unavailable", async () => {
    seedUsers();
    useChatListStore.setState({ currentUserId: null });
    vi.mocked(createChannel).mockResolvedValue({
      streamUuid: "00000000-0000-4000-8000-000000000055",
    });

    const { result } = renderHook(() => useCreateChatDialog(defaultHookOptions()));

    act(() => {
      result.current.setChannelName("engineering");
      result.current.toggleChannelUser(ALICE_UUID);
    });

    act(() => {
      result.current.createChannel();
    });

    await waitFor(() => {
      expect(createChannel).toHaveBeenCalledTimes(1);
    });
    expect(result.current.channelCreateBlocked).toBe(false);
    expect(result.current.channelCreateBlockedReasonKey).toBeNull();
  });

  it("passes canSendMessageGroup when announcement-only channel is enabled", async () => {
    seedUsers();
    seedSystemGroups();
    useChatListStore.setState({ currentUserId: CURRENT_USER_UUID });
    vi.mocked(createChannel).mockResolvedValue(null);

    const { result } = renderHook(() => useCreateChatDialog(defaultHookOptions()));

    act(() => {
      result.current.setChannelName("announcements");
      result.current.setChannelAnnouncementOnly(true);
    });

    act(() => {
      result.current.createChannel();
    });

    await waitFor(() => {
      expect(createChannel).toHaveBeenCalledTimes(1);
    });

    expect(createChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        canSendMessageGroup: {
          direct_members: [CURRENT_USER_UUID],
          direct_subgroups: [11, 12],
        },
      }),
    );
  });

  it("blocks announcement-only when system posting groups are unavailable", () => {
    seedUsers();
    useChatListStore.setState({ currentUserId: 10 });

    const { result } = renderHook(() => useCreateChatDialog(defaultHookOptions()));

    expect(result.current.channelAnnouncementOnlyBlocked).toBe(true);
    expect(result.current.channelAnnouncementOnlyBlockedReasonKey).toBe(
      "channel.announcementOnlyUnsupported",
    );
  });

  it("maps unsupported unarchive responses to the unsupported inline error", async () => {
    seedUsers();
    vi.mocked(unarchiveChannel).mockResolvedValue({
      ok: false,
      kind: "unsupported",
      message: "ignored",
      status: 200,
    });

    const { result } = renderHook(() => useCreateChatDialog(defaultHookOptions()));

    await act(async () => {
      await result.current.onUnarchiveArchivedChannel(STREAM_UUID_5);
    });

    expect(unarchiveChannel).toHaveBeenCalledWith(STREAM_UUID_5);
    expect(result.current.unarchiveInlineError).toEqual({ kind: "unsupported" });
  });

  it("loads browse channels when the channels tab is opened", async () => {
    seedUsers();
    vi.mocked(fetchStreams).mockResolvedValue([
      {
        stream_uuid: STREAM_UUID_5,
        name: "engineering",
        description: "Eng",
        is_announcement_only: false,
      },
      {
        stream_uuid: STREAM_UUID_6,
        name: "design",
        description: "Design",
        is_announcement_only: false,
      },
    ]);
    vi.mocked(fetchSubscriptions).mockResolvedValue([
      { stream_uuid: STREAM_UUID_5, name: "engineering", is_muted: false },
    ]);

    const { result } = renderHook(() => useCreateChatDialog(defaultHookOptions()));

    act(() => {
      result.current.setTab("channels");
    });

    await waitFor(() => {
      expect(result.current.channelsLoading).toBe(false);
    });

    expect(fetchStreams).toHaveBeenCalledTimes(1);
    expect(fetchSubscriptions).toHaveBeenCalledTimes(1);
    expect(result.current.browseChannels).toEqual([
      {
        streamUuid: STREAM_UUID_6,
        name: "design",
        description: "Design",
        isSubscribed: false,
        isMuted: false,
        inviteOnly: null,
        historyPublicToSubscribers: null,
        isAnnouncementOnly: false,
        isWebPublic: false,
        streamPostPolicy: null,
        subscriberCount: null,
        weeklyMessageCount: null,
        creatorId: null,
        dateCreated: null,
        folderId: null,
        isDefault: null,
        isRecentlyActive: null,
        messageRetentionDays: null,
        desktopNotifications: null,
        audibleNotifications: null,
      },
    ]);
    expect(result.current.selectedBrowseChannelUuid).toBe(STREAM_UUID_6);
    expect(result.current.channelsSubscriptionFilter).toBe("unsubscribed");
  });

  it("subscribes to a channel without navigating away from the dialog", async () => {
    seedUsers();
    useChatListStore.setState({ currentUserId: 10 });
    vi.mocked(fetchStreams).mockResolvedValue([
      {
        stream_uuid: STREAM_UUID_7,
        name: "design",
        description: "",
        is_announcement_only: false,
      },
    ]);
    vi.mocked(fetchSubscriptions).mockResolvedValue([]);
    vi.mocked(subscribeCurrentUserToStream).mockResolvedValue({ ok: true });
    const onNavigateStream = vi.fn();

    const { result } = renderHook(() =>
      useCreateChatDialog(defaultHookOptions({ onNavigateStream })),
    );

    act(() => {
      result.current.setTab("channels");
    });

    await waitFor(() => {
      expect(result.current.browseChannels).toHaveLength(1);
    });

    await act(async () => {
      await result.current.onSubscribeToChannel(STREAM_UUID_7, "design");
    });

    expect(subscribeCurrentUserToStream).toHaveBeenCalledWith("design", 10);
    expect(onNavigateStream).not.toHaveBeenCalled();
    expect(useChatListStore.getState().streamsMap.get(STREAM_UUID_7)?.name).toBe("design");

    act(() => {
      result.current.setChannelsSubscriptionFilter("subscribed");
    });

    await waitFor(() => {
      expect(result.current.browseChannels[0]?.isSubscribed).toBe(true);
    });
  });

  it("unsubscribes from a channel and removes it from the sidebar store", async () => {
    seedUsers();
    useChatListStore
      .getState()
      .upsertStreamMetadataRows([{ streamUuid: STREAM_UUID_7, name: "design" }]);
    vi.mocked(fetchStreams).mockResolvedValue([
      {
        stream_uuid: STREAM_UUID_7,
        name: "design",
        description: "Design team",
        is_announcement_only: false,
      },
    ]);
    vi.mocked(fetchSubscriptions).mockResolvedValue([
      { stream_uuid: STREAM_UUID_7, name: "design", is_muted: false, invite_only: false },
    ]);
    vi.mocked(unsubscribeChannel).mockResolvedValue(true);

    const { result } = renderHook(() => useCreateChatDialog(defaultHookOptions()));

    act(() => {
      result.current.setTab("channels");
    });

    await waitFor(() => {
      expect(result.current.channelsLoading).toBe(false);
    });

    act(() => {
      result.current.setChannelsSubscriptionFilter("subscribed");
    });

    await waitFor(() => {
      expect(result.current.browseChannels[0]?.isSubscribed).toBe(true);
    });

    await act(async () => {
      await result.current.onUnsubscribeFromChannel(STREAM_UUID_7, "design");
    });

    expect(unsubscribeChannel).toHaveBeenCalledWith("design");
    expect(useChatListStore.getState().streamsMap.has(STREAM_UUID_7)).toBe(false);
    expect(result.current.browseChannels).toHaveLength(0);
  });

  it("shows noOtherUsers when IAM directory contains only the signed-in user", () => {
    const adminUuid = "00000000-0000-0000-0000-000000000000";
    useUsersStore.getState().mergeUsers([
      {
        user_id: adminUuid,
        full_name: "Admin User",
        email: "admin@example.com",
      },
    ]);
    useChatListStore.setState({ currentUserId: adminUuid });

    const { result } = renderHook(() => useCreateChatDialog(defaultHookOptions()));

    expect(result.current.filteredUsers).toEqual([]);
    expect(result.current.userPickerEmptyLabelKey).toBe("dm.noOtherUsers");
  });
});
