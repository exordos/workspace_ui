import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useUsersStore } from "~/entities/user/user.model";
import { useUserGroupsStore } from "~/entities/user-group/user-group.model";
import { fetchStreams, fetchSubscriptions } from "~/shared/api/zulip-streams";
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

vi.mock("~/shared/api/zulip-streams", () => ({
  fetchStreams: vi.fn(),
  fetchSubscriptions: vi.fn(),
}));

function defaultHookOptions(overrides: Partial<Parameters<typeof useCreateChatDialog>[0]> = {}) {
  return {
    open: true,
    onNavigateDm: vi.fn(),
    onNavigateStream: vi.fn(),
    onChannelCreated: vi.fn(),
    ...overrides,
  };
}

function seedUsers(): void {
  useUsersStore.getState().mergeUsers([
    { user_id: 10, full_name: "Current User", email: "me@example.com" },
    { user_id: 1, full_name: "Alice", email: "alice@example.com" },
    { user_id: 3, full_name: "Bob", email: "bob@example.com" },
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

  it("adds current user to subscribers and deduplicates IDs when creating channel", async () => {
    seedUsers();
    useChatListStore.setState({ currentUserId: 10 });
    vi.mocked(createChannel).mockResolvedValue({ streamId: 55 });
    const onChannelCreated = vi.fn();

    const { result } = renderHook(() =>
      useCreateChatDialog(defaultHookOptions({ onChannelCreated })),
    );

    act(() => {
      result.current.setChannelName("  engineering  ");
      result.current.toggleChannelUser(3);
      result.current.toggleChannelUser(1);
      result.current.toggleChannelUser(10);
    });

    act(() => {
      result.current.createChannel();
    });

    await waitFor(() => {
      expect(createChannel).toHaveBeenCalledTimes(1);
    });

    // Assert: request includes author and selected users without duplicates.
    expect(createChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "engineering",
        subscribers: [1, 3, 10],
      }),
    );

    await waitFor(() => {
      expect(onChannelCreated).toHaveBeenCalledTimes(1);
    });
  });

  it("blocks channel creation when current user ID is unavailable", () => {
    seedUsers();
    useChatListStore.setState({ currentUserId: null });

    const { result } = renderHook(() => useCreateChatDialog(defaultHookOptions()));

    act(() => {
      result.current.setChannelName("engineering");
      result.current.toggleChannelUser(1);
      result.current.createChannel();
    });

    // Assert: without currentUserId, creation must not start.
    expect(result.current.channelCreateBlocked).toBe(true);
    expect(result.current.channelCreateBlockedReasonKey).toBe("channel.creatorProfileLoading");
    expect(createChannel).not.toHaveBeenCalled();
  });

  it("passes canSendMessageGroup when announcement-only channel is enabled", async () => {
    seedUsers();
    seedSystemGroups();
    useChatListStore.setState({ currentUserId: 10 });
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
          direct_members: [10],
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
      await result.current.onUnarchiveArchivedChannel(5);
    });

    expect(unarchiveChannel).toHaveBeenCalledWith(5);
    expect(result.current.unarchiveInlineError).toEqual({ kind: "unsupported" });
  });

  it("loads browse channels when the channels tab is opened", async () => {
    seedUsers();
    vi.mocked(fetchStreams).mockResolvedValue([
      {
        stream_id: 5,
        name: "engineering",
        description: "Eng",
        is_announcement_only: false,
      },
      {
        stream_id: 6,
        name: "design",
        description: "Design",
        is_announcement_only: false,
      },
    ]);
    vi.mocked(fetchSubscriptions).mockResolvedValue([
      { stream_id: 5, name: "engineering", is_muted: false },
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
        streamId: 6,
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
    expect(result.current.selectedBrowseChannelId).toBe(6);
    expect(result.current.channelsSubscriptionFilter).toBe("unsubscribed");
  });

  it("subscribes to a channel without navigating away from the dialog", async () => {
    seedUsers();
    useChatListStore.setState({ currentUserId: 10 });
    vi.mocked(fetchStreams).mockResolvedValue([
      {
        stream_id: 7,
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
      await result.current.onSubscribeToChannel(7, "design");
    });

    expect(subscribeCurrentUserToStream).toHaveBeenCalledWith("design", 10);
    expect(onNavigateStream).not.toHaveBeenCalled();
    expect(useChatListStore.getState().streamsMap.get(7)?.name).toBe("design");

    act(() => {
      result.current.setChannelsSubscriptionFilter("subscribed");
    });

    await waitFor(() => {
      expect(result.current.browseChannels[0]?.isSubscribed).toBe(true);
    });
  });

  it("unsubscribes from a channel and removes it from the sidebar store", async () => {
    seedUsers();
    useChatListStore.getState().upsertStreamMetadataRows([{ streamId: 7, name: "design" }]);
    vi.mocked(fetchStreams).mockResolvedValue([
      {
        stream_id: 7,
        name: "design",
        description: "Design team",
        is_announcement_only: false,
      },
    ]);
    vi.mocked(fetchSubscriptions).mockResolvedValue([
      { stream_id: 7, name: "design", is_muted: false, invite_only: false },
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
      await result.current.onUnsubscribeFromChannel(7, "design");
    });

    expect(unsubscribeChannel).toHaveBeenCalledWith("design");
    expect(useChatListStore.getState().streamsMap.has(7)).toBe(false);
    expect(result.current.browseChannels).toHaveLength(0);
  });
});
