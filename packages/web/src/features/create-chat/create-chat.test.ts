/**
 * Tests for create-chat feature.
 *
 * Verifies the store manages user search, selection, and creation flow
 * for DMs, group chats, and channels. Also tests API functions for
 * fetching subscribed channels and unsubscribing.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCreateChatStore } from "./create-chat.model";

vi.mock("~/shared/api/client", () => ({
  zulipApi: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

describe("useCreateChatStore", () => {
  afterEach(() => {
    useCreateChatStore.getState().reset();
  });

  // Initial state should be idle with no selections
  describe("initial state", () => {
    it("starts with idle status and empty selections", () => {
      const state = useCreateChatStore.getState();
      expect(state.status).toBe("idle");
      expect(state.selectedUserIds).toHaveLength(0);
      expect(state.chatType).toBe("dm");
      expect(state.searchQuery).toBe("");
    });
  });

  // User selection for DMs and group chats
  describe("user selection", () => {
    // Adding a user should add their ID to the selection
    it("toggleUser adds user", () => {
      useCreateChatStore.getState().toggleUser(42);
      expect(useCreateChatStore.getState().selectedUserIds).toContain(42);
    });

    // Toggling the same user again should remove them
    it("toggleUser removes already-selected user", () => {
      useCreateChatStore.getState().toggleUser(42);
      useCreateChatStore.getState().toggleUser(42);
      expect(useCreateChatStore.getState().selectedUserIds).not.toContain(42);
    });

    // Multiple users can be selected for group chats
    it("supports multiple selections", () => {
      useCreateChatStore.getState().toggleUser(1);
      useCreateChatStore.getState().toggleUser(2);
      useCreateChatStore.getState().toggleUser(3);
      expect(useCreateChatStore.getState().selectedUserIds).toHaveLength(3);
    });

    // clearSelection removes all selected users
    it("clearSelection removes all", () => {
      useCreateChatStore.getState().toggleUser(1);
      useCreateChatStore.getState().toggleUser(2);
      useCreateChatStore.getState().clearSelection();
      expect(useCreateChatStore.getState().selectedUserIds).toHaveLength(0);
    });
  });

  // Chat type management
  describe("chat type", () => {
    // Switching to group type should preserve selected users
    it("setChatType changes type", () => {
      useCreateChatStore.getState().setChatType("group");
      expect(useCreateChatStore.getState().chatType).toBe("group");
    });

    // Switching to channel should be possible
    it("setChatType to channel", () => {
      useCreateChatStore.getState().setChatType("channel");
      expect(useCreateChatStore.getState().chatType).toBe("channel");
    });
  });

  // Channel creation params
  describe("channel params", () => {
    it("setChannelName updates name", () => {
      useCreateChatStore.getState().setChannelName("engineering");
      expect(useCreateChatStore.getState().channelName).toBe("engineering");
    });

    it("setChannelDescription updates description", () => {
      useCreateChatStore.getState().setChannelDescription("For engineers");
      expect(useCreateChatStore.getState().channelDescription).toBe("For engineers");
    });
  });

  // Search query for user filtering
  describe("search", () => {
    it("setSearchQuery updates query", () => {
      useCreateChatStore.getState().setSearchQuery("alice");
      expect(useCreateChatStore.getState().searchQuery).toBe("alice");
    });
  });

  // Reset clears everything
  describe("reset", () => {
    it("resets all state to initial", () => {
      useCreateChatStore.getState().toggleUser(42);
      useCreateChatStore.getState().setChatType("channel");
      useCreateChatStore.getState().setChannelName("test");
      useCreateChatStore.getState().setSearchQuery("x");
      useCreateChatStore.getState().reset();

      const state = useCreateChatStore.getState();
      expect(state.selectedUserIds).toHaveLength(0);
      expect(state.chatType).toBe("dm");
      expect(state.channelName).toBe("");
      expect(state.searchQuery).toBe("");
    });
  });
});

// Channel API — create, list, and unsubscribe operations.
describe("Channel API", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // createChannel — POST /channels/create
  describe("createChannel", () => {
    it("creates channel and returns streamId on success", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.post).mockResolvedValue({
        ok: true,
        status: 200,
        data: { id: 42 },
        headers: new Headers(),
        raw: new Response(),
        durationMs: 50,
      });

      const { createChannel } = await import("./create-chat.api");
      // Что проверяет: для нового endpoint `/channels/create` корректно читаем id из ответа.
      const result = await createChannel({
        name: "engineering",
        description: "Engineering team",
        subscribers: [1, 2],
      });

      expect(result).toEqual({ streamId: 42 });
      expect(zulipApi.post).toHaveBeenCalledWith(
        "/channels/create",
        expect.objectContaining({
          name: "engineering",
          description: "Engineering team",
          subscribers: JSON.stringify([1, 2]),
        }),
      );
    });

    it("returns streamId 0 when response does not include channel id", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.post).mockResolvedValue({
        ok: true,
        status: 200,
        data: {},
        headers: new Headers(),
        raw: new Response(),
        durationMs: 30,
      });

      const { createChannel } = await import("./create-chat.api");
      const result = await createChannel({ name: "test", subscribers: [] });

      expect(result).toEqual({ streamId: 0 });
    });

    it("passes invite_only and announce flags when set", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.post).mockResolvedValue({
        ok: true,
        status: 200,
        data: { subscribed: {} },
        headers: new Headers(),
        raw: new Response(),
        durationMs: 30,
      });

      const { createChannel } = await import("./create-chat.api");
      // Что проверяет: `invite_only` и `announce` попадают в payload независимо от других полей.
      await createChannel({
        name: "secret",
        subscribers: [],
        inviteOnly: true,
        announce: false,
      });

      expect(zulipApi.post).toHaveBeenCalledWith(
        "/channels/create",
        expect.objectContaining({
          invite_only: "true",
          announce: "false",
        }),
      );
    });

    it("passes can_send_message_group when announcement-only policy is set", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.post).mockResolvedValue({
        ok: true,
        status: 200,
        data: { id: 55 },
        headers: new Headers(),
        raw: new Response(),
        durationMs: 30,
      });

      const { createChannel } = await import("./create-chat.api");
      // Что проверяет: режим "Канал объявлений" сериализуется в `can_send_message_group`.
      await createChannel({
        name: "announcements",
        subscribers: [],
        canSendMessageGroup: {
          direct_members: [],
          direct_subgroups: [4, 6],
        },
      });

      expect(zulipApi.post).toHaveBeenCalledWith(
        "/channels/create",
        expect.objectContaining({
          can_send_message_group: JSON.stringify({
            direct_members: [],
            direct_subgroups: [4, 6],
          }),
        }),
      );
    });

    it("omits subscribers when subscribers list is empty", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.post).mockClear();
      vi.mocked(zulipApi.post).mockResolvedValue({
        ok: true,
        status: 200,
        data: { id: 5 },
        headers: new Headers(),
        raw: new Response(),
        durationMs: 30,
      });

      const { createChannel } = await import("./create-chat.api");
      // Что проверяет: не отправляем пустой список подписчиков как `[]`, чтобы не шуметь payload.
      await createChannel({ name: "test", subscribers: [] });

      const callBody = vi.mocked(zulipApi.post).mock.calls[0]![1];
      expect(callBody.subscribers).toBeUndefined();
    });

    it("returns null on API failure", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.post).mockResolvedValue({
        ok: false,
        status: 400,
        data: null,
        headers: new Headers(),
        raw: new Response(),
        durationMs: 10,
      });

      const { createChannel } = await import("./create-chat.api");
      const result = await createChannel({ name: "engineering", subscribers: [1] });
      expect(result).toBeNull();
    });

    it("returns null on network error", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.post).mockRejectedValue(new Error("Network error"));

      const { createChannel } = await import("./create-chat.api");
      const result = await createChannel({ name: "engineering", subscribers: [1] });
      expect(result).toBeNull();
    });

    it("rejects on empty channel name (guard)", async () => {
      const { createChannel } = await import("./create-chat.api");
      await expect(createChannel({ name: "", subscribers: [] })).rejects.toThrow();
    });

    it("uses empty description when not provided", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.post).mockClear();
      vi.mocked(zulipApi.post).mockResolvedValue({
        ok: true,
        status: 200,
        data: { id: 10 },
        headers: new Headers(),
        raw: new Response(),
        durationMs: 30,
      });

      const { createChannel } = await import("./create-chat.api");
      await createChannel({ name: "test", subscribers: [] });

      const callBody = vi.mocked(zulipApi.post).mock.calls[0]![1];
      expect(callBody.description).toBe("");
    });
  });

  describe("fetchSubscribedChannels", () => {
    it("returns mapped channels on success", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.get).mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          subscriptions: [
            {
              stream_id: 1,
              name: "general",
              description: "General chat",
              invite_only: false,
              subscribers: [10, 20],
            },
            {
              stream_id: 2,
              name: "engineering",
              description: "",
              invite_only: true,
            },
          ],
        },
        headers: new Headers(),
        raw: new Response(),
        durationMs: 50,
      });

      const { fetchSubscribedChannels } = await import("./create-chat.api");
      const channels = await fetchSubscribedChannels();

      expect(channels).toHaveLength(2);
      expect(channels[0]!.streamId).toBe(1);
      expect(channels[0]!.name).toBe("general");
      expect(channels[0]!.inviteOnly).toBe(false);
      expect(channels[0]!.subscribers).toEqual([10, 20]);
      expect(channels[1]!.subscribers).toEqual([]);
    });

    it("returns empty array on error response", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.get).mockResolvedValue({
        ok: false,
        status: 401,
        data: null,
        headers: new Headers(),
        raw: new Response(),
        durationMs: 10,
      });

      const { fetchSubscribedChannels } = await import("./create-chat.api");
      const channels = await fetchSubscribedChannels();
      expect(channels).toEqual([]);
    });

    it("returns empty array on network error", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.get).mockRejectedValue(new Error("Network error"));

      const { fetchSubscribedChannels } = await import("./create-chat.api");
      const channels = await fetchSubscribedChannels();
      expect(channels).toEqual([]);
    });
  });

  describe("unsubscribeChannel", () => {
    it("returns true on success", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.delete).mockResolvedValue({
        ok: true,
        status: 200,
        data: { removed: ["general"] },
        headers: new Headers(),
        raw: new Response(),
        durationMs: 30,
      });

      const { unsubscribeChannel } = await import("./create-chat.api");
      const success = await unsubscribeChannel("general");
      expect(success).toBe(true);
    });

    it("returns false on failure", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.delete).mockResolvedValue({
        ok: false,
        status: 400,
        data: null,
        headers: new Headers(),
        raw: new Response(),
        durationMs: 10,
      });

      const { unsubscribeChannel } = await import("./create-chat.api");
      const success = await unsubscribeChannel("nonexistent");
      expect(success).toBe(false);
    });

    it("returns false on network error", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.delete).mockRejectedValue(new Error("Network error"));

      const { unsubscribeChannel } = await import("./create-chat.api");
      const success = await unsubscribeChannel("general");
      expect(success).toBe(false);
    });
  });
});
