import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useUsersStore } from "~/entities/user/user.model";
import { useUserGroupsStore } from "~/entities/user-group/user-group.model";
import { useCreateChatDialog } from "./create-chat-dialog.hook";
import { createChannel, unarchiveChannel } from "./create-chat.api";

vi.mock("./create-chat.api", () => ({
  createChannel: vi.fn(),
  unarchiveChannel: vi.fn(),
}));

function seedUsers(): void {
  useUsersStore.getState().mergeUsers([
    { user_id: 10, full_name: "Current User", email: "me@example.com" },
    { user_id: 1, full_name: "Alice", email: "alice@example.com" },
    { user_id: 3, full_name: "Bob", email: "bob@example.com" },
  ]);
}

function seedSystemGroups(): void {
  // Что делает: эмулирует системные группы Zulip, которые используются
  // для дефолтной политики "писать могут модераторы и администраторы".
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
      useCreateChatDialog({
        open: true,
        onNavigateDm: vi.fn(),
        onChannelCreated,
      }),
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

    // Что проверяет: в запрос уходит и автор, и выбранные пользователи без дублей.
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

    const { result } = renderHook(() =>
      useCreateChatDialog({
        open: true,
        onNavigateDm: vi.fn(),
        onChannelCreated: vi.fn(),
      }),
    );

    act(() => {
      result.current.setChannelName("engineering");
      result.current.toggleChannelUser(1);
      result.current.createChannel();
    });

    // Что проверяет: без currentUserId создание не должно стартовать.
    expect(result.current.channelCreateBlocked).toBe(true);
    expect(result.current.channelCreateBlockedReasonKey).toBe("channel.creatorProfileLoading");
    expect(createChannel).not.toHaveBeenCalled();
  });

  it("passes canSendMessageGroup when announcement-only channel is enabled", async () => {
    seedUsers();
    seedSystemGroups();
    useChatListStore.setState({ currentUserId: 10 });
    vi.mocked(createChannel).mockResolvedValue(null);

    const { result } = renderHook(() =>
      useCreateChatDialog({
        open: true,
        onNavigateDm: vi.fn(),
        onChannelCreated: vi.fn(),
      }),
    );

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

    // Что проверяет: при включении "Канал объявлений" в API уходит
    // именно объединенный group-setting из двух системных групп.
    expect(createChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        canSendMessageGroup: {
          direct_members: [10],
          direct_subgroups: [11, 12],
        },
      }),
    );
  });

  it("disables announcement-only checkbox when system groups are unavailable", () => {
    seedUsers();
    useChatListStore.setState({ currentUserId: 10 });

    const { result } = renderHook(() =>
      useCreateChatDialog({
        open: true,
        onNavigateDm: vi.fn(),
        onChannelCreated: vi.fn(),
      }),
    );

    // Что проверяет: без системных групп чекбокс блокируется и показывается reason key.
    expect(result.current.channelAnnouncementOnlyBlocked).toBe(true);
    expect(result.current.channelAnnouncementOnlyBlockedReasonKey).toBe(
      "channel.announcementOnlyUnsupported",
    );
  });

  it("вызывает unarchiveChannel при разархивировании и очищает ошибку при успехе", async () => {
    seedUsers();
    vi.mocked(unarchiveChannel).mockResolvedValue({ ok: true });
    useChatListStore.setState({ currentUserId: 10 });

    const { result } = renderHook(() =>
      useCreateChatDialog({
        open: true,
        onNavigateDm: vi.fn(),
        onChannelCreated: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.onUnarchiveArchivedChannel(77);
    });

    expect(unarchiveChannel).toHaveBeenCalledWith(77);
    expect(result.current.unarchiveInlineError).toBe(null);
    expect(result.current.unarchivePendingStreamIds).toEqual([]);
  });

  it("помечает unsupported-ответ Zulip как отдельную inline-ошибку", async () => {
    seedUsers();
    vi.mocked(unarchiveChannel).mockResolvedValue({
      ok: false,
      kind: "unsupported",
      message: "ignored",
      status: 200,
    });

    const { result } = renderHook(() =>
      useCreateChatDialog({
        open: true,
        onNavigateDm: vi.fn(),
        onChannelCreated: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.onUnarchiveArchivedChannel(5);
    });

    expect(result.current.unarchiveInlineError).toEqual({ kind: "unsupported" });
  });

  it("передаёт текст ошибки сервера в failed-состояние", async () => {
    seedUsers();
    vi.mocked(unarchiveChannel).mockResolvedValue({
      ok: false,
      kind: "transient",
      message: "Server busy",
      status: 503,
    });

    const { result } = renderHook(() =>
      useCreateChatDialog({
        open: true,
        onNavigateDm: vi.fn(),
        onChannelCreated: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.onUnarchiveArchivedChannel(8);
    });

    expect(result.current.unarchiveInlineError).toEqual({
      kind: "failed",
      message: "Server busy",
    });
  });

  it("не подмешивает демо-архивные каналы: вкладка пустая без записей в store", () => {
    seedUsers();

    const { result } = renderHook(() =>
      useCreateChatDialog({
        open: true,
        onNavigateDm: vi.fn(),
        onChannelCreated: vi.fn(),
      }),
    );

    act(() => {
      result.current.setTab("archived");
    });

    expect(result.current.archivedChannels).toEqual([]);
    expect(useChatListStore.getState().streamsMap.get(91001)).toBeUndefined();
  });
});
