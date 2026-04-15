import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useUsersStore } from "~/entities/user/user.model";
import { useCreateChatDialog } from "./create-chat-dialog.hook";
import { createChannel } from "./create-chat.api";

vi.mock("./create-chat.api", () => ({
  createChannel: vi.fn(),
}));

function seedUsers(): void {
  useUsersStore.getState().mergeUsers([
    { user_id: 10, full_name: "Current User", email: "me@example.com" },
    { user_id: 1, full_name: "Alice", email: "alice@example.com" },
    { user_id: 3, full_name: "Bob", email: "bob@example.com" },
  ]);
}

describe("useCreateChatDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUsersStore.getState().clear();
    useChatListStore.getState().clear();
  });

  afterEach(() => {
    useUsersStore.getState().clear();
    useChatListStore.getState().clear();
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
});
