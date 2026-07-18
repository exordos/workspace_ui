import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import { useFolderSyncStore } from "~/features/folder-sync/folder-sync.model";
import { markMessagesAsRead } from "~/shared/api/messenger-read-state";
import type { MockMessage } from "~/shared/api/messenger.types";
import type { FolderItemForClient, WorkspaceFolderForRail } from "~/shared/api/workspace-client";
import { applyOpenChatMarkAllAsRead } from "./chat-mark-all-read.lib";
import { useChatPageMarkRead } from "./chat-page-mark-read.hook";

vi.mock("~/shared/api/messenger-read-state", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/shared/api/messenger-read-state")>();
  return {
    ...actual,
    markMessagesAsRead: vi.fn().mockResolvedValue([]),
  };
});

vi.mock("./chat-mark-all-read.lib", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./chat-mark-all-read.lib")>();
  return {
    ...actual,
    applyOpenChatMarkAllAsRead: vi.fn().mockResolvedValue(true),
  };
});

const useShortcutMock = vi.fn();
vi.mock("~/shared/lib/shortcuts", () => ({
  useShortcut: (...args: unknown[]) => useShortcutMock(...args),
}));

const CURRENT_USER_ID = 7;
const STREAM_ID = "00000000-0000-4000-8000-000000000012";
const TOPIC_UUID = "00000000-0000-4000-8000-000000000099";
const TOPIC = "general";
const MESSAGE_ID = "00000000-0000-4000-8000-000000000501";
const originalFolderRefresh = useFolderSyncStore.getState().refresh;

function message(overrides: Partial<MockMessage> = {}): MockMessage {
  return {
    id: MESSAGE_ID,
    sender_id: 42,
    sender_full_name: "Alice",
    stream_uuid: STREAM_ID,
    topic_uuid: TOPIC_UUID,
    subject: TOPIC,
    content: "hello",
    timestamp: 1,
    read: false,
    ...overrides,
  };
}

function defaultParams(
  overrides: Partial<Parameters<typeof useChatPageMarkRead>[0]> = {},
): Parameters<typeof useChatPageMarkRead>[0] {
  return {
    currentUserId: CURRENT_USER_ID,
    isDmView: false,
    activeDmUserIds: null,
    activeStreamId: STREAM_ID,
    activeTopic: TOPIC,
    activeTopicUuid: TOPIC_UUID,
    streamSlug: STREAM_ID,
    topicName: encodeURIComponent(TOPIC),
    dmIdParam: undefined,
    messages: [],
    updateMessageFlagsInStore: vi.fn(),
    ...overrides,
  };
}

describe("useChatPageMarkRead", () => {
  beforeEach(() => {
    useChatListStore.getState().clear();
    useCurrentChatMessagesStore.getState().setMessages([]);
    useFolderSyncStore.getState().clear();
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    vi.mocked(applyOpenChatMarkAllAsRead).mockClear();
    vi.mocked(applyOpenChatMarkAllAsRead).mockResolvedValue(true);
    vi.mocked(markMessagesAsRead).mockClear();
    vi.mocked(markMessagesAsRead).mockResolvedValue([]);
    useShortcutMock.mockClear();
  });

  afterEach(() => {
    useChatListStore.getState().clear();
    useCurrentChatMessagesStore.getState().setMessages([]);
    useFolderSyncStore.setState({ refresh: originalFolderRefresh });
    useFolderSyncStore.getState().clear();
    vi.restoreAllMocks();
  });

  it("requests visible unread messages and applies API-confirmed read ids", async () => {
    const updateMessageFlagsInStore = vi.fn();
    const refresh = vi.fn().mockResolvedValue(undefined);
    useFolderSyncStore.setState({ refresh });
    const applyStreamUnreadCount = vi.spyOn(
      useFolderSyncStore.getState(),
      "applyStreamUnreadCount",
    );
    useChatListStore
      .getState()
      .upsertStreamMetadataRows([{ streamUuid: STREAM_ID, name: "general", unreadCount: 1 }]);
    useChatListStore
      .getState()
      .upsertStreamTopicShells(STREAM_ID, [
        { streamUuid: STREAM_ID, topicUuid: TOPIC_UUID, name: TOPIC, unreadCount: 1 },
      ]);
    useCurrentChatMessagesStore.getState().setMessages([message()]);
    vi.mocked(markMessagesAsRead).mockResolvedValue([MESSAGE_ID]);
    const { result } = renderHook(() =>
      useChatPageMarkRead(
        defaultParams({
          messages: [message()],
          updateMessageFlagsInStore,
        }),
      ),
    );

    act(() => {
      result.current.handleUnreadMessagesVisible([MESSAGE_ID]);
    });

    await waitFor(() => {
      expect(markMessagesAsRead).toHaveBeenCalledWith([MESSAGE_ID]);
    });
    await waitFor(() => {
      expect(updateMessageFlagsInStore).toHaveBeenCalledWith([MESSAGE_ID], "read", "add");
    });
    const stream = useChatListStore.getState().streamsMap.get(STREAM_ID);
    expect(stream?.unreadCount).toBe(0);
    expect(stream?.topics.get(TOPIC)?.unreadCount).toBe(0);
    expect(applyStreamUnreadCount).toHaveBeenCalledWith(STREAM_ID, 0);
    expect(refresh).not.toHaveBeenCalled();
    expect(applyOpenChatMarkAllAsRead).not.toHaveBeenCalled();
  });

  it("refreshes folder unread metadata after an API-confirmed DM read", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const dmFolder: WorkspaceFolderForRail = {
      id: "custom-dm-folder",
      label: "DMs",
      backgroundColor: 0,
      badge: 1,
      systemType: "created",
    };
    const dmFolderItem: FolderItemForClient = {
      uuid: "dm-folder-item",
      chatId: `dm:${CURRENT_USER_ID},42`,
      folderUuid: dmFolder.id,
      unreadCount: 1,
      orderIndex: 0,
      pinnedAt: null,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    useFolderSyncStore.setState({
      refresh,
      folders: [dmFolder],
      folderItemsByFolderId: new Map([[dmFolder.id, [dmFolderItem]]]),
    });
    const dmMessage = message({
      stream_uuid: null,
      topic_uuid: undefined,
      subject: "",
      display_recipient: [
        { id: CURRENT_USER_ID, full_name: "Current user" },
        { id: 42, full_name: "Alice" },
      ],
    });
    useCurrentChatMessagesStore.getState().setMessages([dmMessage]);
    vi.mocked(markMessagesAsRead).mockResolvedValue([MESSAGE_ID]);
    const updateMessageFlagsInStore = vi.fn();
    const { result } = renderHook(() =>
      useChatPageMarkRead(
        defaultParams({
          isDmView: true,
          activeDmUserIds: [CURRENT_USER_ID, 42],
          activeDmStreamId: null,
          activeStreamId: null,
          activeTopic: undefined,
          messages: [dmMessage],
          updateMessageFlagsInStore,
        }),
      ),
    );

    act(() => {
      result.current.handleUnreadMessagesVisible([MESSAGE_ID]);
    });

    await waitFor(() => {
      expect(updateMessageFlagsInStore).toHaveBeenCalledWith([MESSAGE_ID], "read", "add");
    });
    // A DM has no stream projection, so the server folder snapshot must clear its folder badge.
    expect(refresh).toHaveBeenCalledWith("mutation");
  });

  it("refreshes unread metadata when a confirmed read is no longer locally projectable", async () => {
    let resolveRead: ((ids: string[]) => void) | null = null;
    vi.mocked(markMessagesAsRead).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
    );
    const refresh = vi.fn().mockResolvedValue(undefined);
    useFolderSyncStore.setState({ refresh });
    useChatListStore
      .getState()
      .upsertStreamMetadataRows([{ streamUuid: STREAM_ID, name: "general", unreadCount: 1 }]);
    useCurrentChatMessagesStore.getState().setMessages([message()]);
    const updateMessageFlagsInStore = vi.fn();
    const { result } = renderHook(() =>
      useChatPageMarkRead(
        defaultParams({
          messages: [message()],
          updateMessageFlagsInStore,
        }),
      ),
    );

    act(() => {
      result.current.handleUnreadMessagesVisible([MESSAGE_ID]);
    });
    await waitFor(() => {
      expect(markMessagesAsRead).toHaveBeenCalledWith([MESSAGE_ID]);
    });

    // The user navigated to another chat while the read request was in flight.
    useCurrentChatMessagesStore.getState().setMessages([
      message({
        id: "00000000-0000-4000-8000-000000000777",
        stream_uuid: "00000000-0000-4000-8000-000000000078",
      }),
    ]);
    act(() => {
      resolveRead?.([MESSAGE_ID]);
    });

    await waitFor(() => {
      expect(updateMessageFlagsInStore).toHaveBeenCalledWith([MESSAGE_ID], "read", "add");
    });
    expect(refresh).toHaveBeenCalledWith("mutation");
    expect(useChatListStore.getState().streamsMap.get(STREAM_ID)?.unreadCount).toBe(1);
  });

  it("does not decrement unread metadata twice when realtime wins the API response race", async () => {
    let resolveRead: ((ids: string[]) => void) | null = null;
    vi.mocked(markMessagesAsRead).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
    );
    useChatListStore
      .getState()
      .upsertStreamMetadataRows([{ streamUuid: STREAM_ID, name: "general", unreadCount: 2 }]);
    useChatListStore
      .getState()
      .upsertStreamTopicShells(STREAM_ID, [
        { streamUuid: STREAM_ID, topicUuid: TOPIC_UUID, name: TOPIC, unreadCount: 2 },
      ]);
    useCurrentChatMessagesStore.getState().setMessages([message()]);
    const updateMessageFlagsInStore = vi.fn();
    const { result } = renderHook(() =>
      useChatPageMarkRead(
        defaultParams({
          messages: [message()],
          updateMessageFlagsInStore,
        }),
      ),
    );

    act(() => {
      result.current.handleUnreadMessagesVisible([MESSAGE_ID]);
    });
    await waitFor(() => {
      expect(markMessagesAsRead).toHaveBeenCalledWith([MESSAGE_ID]);
    });

    // Realtime confirmation applies first, including the local unread metadata delta.
    useChatListStore
      .getState()
      .upsertStreamMetadataRows([{ streamUuid: STREAM_ID, name: "general", unreadCount: 1 }]);
    useChatListStore
      .getState()
      .upsertStreamTopicShells(STREAM_ID, [
        { streamUuid: STREAM_ID, topicUuid: TOPIC_UUID, name: TOPIC, unreadCount: 1 },
      ]);
    useCurrentChatMessagesStore.getState().setMessages([message({ read: true })]);

    act(() => {
      resolveRead?.([MESSAGE_ID]);
    });

    await waitFor(() => {
      expect(updateMessageFlagsInStore).toHaveBeenCalledWith([MESSAGE_ID], "read", "add");
    });
    const stream = useChatListStore.getState().streamsMap.get(STREAM_ID);
    expect(stream?.unreadCount).toBe(1);
    expect(stream?.topics.get(TOPIC)?.unreadCount).toBe(1);
  });

  it("does not request visible unread messages when the window is inactive", () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    const updateMessageFlagsInStore = vi.fn();
    const { result } = renderHook(() =>
      useChatPageMarkRead(
        defaultParams({
          messages: [message()],
          updateMessageFlagsInStore,
        }),
      ),
    );

    act(() => {
      result.current.handleUnreadMessagesVisible([MESSAGE_ID]);
    });

    expect(markMessagesAsRead).not.toHaveBeenCalled();
    expect(updateMessageFlagsInStore).not.toHaveBeenCalled();
  });

  it("does not mark visible messages locally without API-confirmed ids", async () => {
    const updateMessageFlagsInStore = vi.fn();
    const { result } = renderHook(() =>
      useChatPageMarkRead(
        defaultParams({
          messages: [message()],
          updateMessageFlagsInStore,
        }),
      ),
    );

    act(() => {
      result.current.handleUnreadMessagesAtBottom([MESSAGE_ID]);
    });

    await waitFor(() => {
      expect(markMessagesAsRead).toHaveBeenCalledWith([MESSAGE_ID]);
    });
    expect(updateMessageFlagsInStore).not.toHaveBeenCalled();
  });

  it("handleMarkAllAsRead delegates topic target to applyOpenChatMarkAllAsRead", async () => {
    const { result } = renderHook(() => useChatPageMarkRead(defaultParams()));

    act(() => {
      result.current.handleMarkAllAsRead();
    });

    await waitFor(() => {
      expect(applyOpenChatMarkAllAsRead).toHaveBeenCalledTimes(1);
    });
    expect(applyOpenChatMarkAllAsRead).toHaveBeenCalledWith({
      target: { type: "topic", streamId: STREAM_ID, topic: TOPIC, topicUuid: TOPIC_UUID },
      currentUserId: CURRENT_USER_ID,
    });
  });

  it("handleMarkAllAsRead delegates DM target to applyOpenChatMarkAllAsRead", async () => {
    const { result } = renderHook(() =>
      useChatPageMarkRead(
        defaultParams({
          isDmView: true,
          activeDmUserIds: [CURRENT_USER_ID, 42],
          activeDmStreamId: STREAM_ID,
          activeStreamId: null,
          activeTopic: undefined,
        }),
      ),
    );

    act(() => {
      result.current.handleMarkAllAsRead();
    });

    await waitFor(() => {
      expect(applyOpenChatMarkAllAsRead).toHaveBeenCalledWith({
        target: { type: "dm", userIds: [CURRENT_USER_ID, 42], streamId: STREAM_ID },
        currentUserId: CURRENT_USER_ID,
      });
    });
  });

  it("skips mark-all when stream route has no active topic", () => {
    const { result } = renderHook(() =>
      useChatPageMarkRead(
        defaultParams({
          activeTopic: undefined,
          topicName: undefined,
        }),
      ),
    );

    act(() => {
      result.current.handleMarkAllAsRead();
    });

    expect(applyOpenChatMarkAllAsRead).not.toHaveBeenCalled();
  });

  it("registers mod+shift+m shortcut for mark-all-read", () => {
    renderHook(() => useChatPageMarkRead(defaultParams()));

    expect(useShortcutMock).toHaveBeenCalledWith(
      "mod+shift+m",
      expect.any(Function),
      expect.objectContaining({
        context: "chat",
        enabled: true,
      }),
    );
  });
});
