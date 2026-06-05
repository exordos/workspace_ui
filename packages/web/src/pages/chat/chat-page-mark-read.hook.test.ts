import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInboxStore } from "~/entities/inbox/inbox.model";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import type { CurrentChatContext } from "~/entities/message/message.model.types";
import { markMessagesAsRead } from "~/shared/api/zulip-read-state";
import type { MockMessage } from "~/shared/api/zulip.types";
import { createMessage } from "~/test/factories";
import { applyOpenChatMarkAllAsRead } from "./chat-mark-all-read.lib";
import { useChatPageMarkRead } from "./chat-page-mark-read.hook";

vi.mock("~/shared/api/zulip-read-state", () => ({
  markMessagesAsRead: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./chat-mark-all-read.lib", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./chat-mark-all-read.lib")>();
  return {
    ...actual,
    applyOpenChatMarkAllAsRead: vi.fn().mockResolvedValue(undefined),
  };
});

const useShortcutMock = vi.fn();
vi.mock("~/shared/lib/shortcuts", () => ({
  useShortcut: (...args: unknown[]) => useShortcutMock(...args),
}));

const CURRENT_USER_ID = 7;
const STREAM_ID = 12;
const TOPIC = "general";
const MESSAGE_ID = 501;

function streamTopicMessage(overrides: Partial<MockMessage> = {}): MockMessage {
  return createMessage({
    id: MESSAGE_ID,
    stream_id: STREAM_ID,
    display_recipient: "engineering",
    subject: TOPIC,
    sender_id: 42,
    flags: [],
    type: "stream",
    ...overrides,
  });
}

function defaultParams(overrides: Partial<Parameters<typeof useChatPageMarkRead>[0]> = {}) {
  return {
    messages: [streamTopicMessage()],
    currentUserId: CURRENT_USER_ID,
    isDmView: false,
    activeDmUserIds: null as number[] | null,
    activeStreamId: STREAM_ID,
    activeTopic: TOPIC,
    streamSlug: `${STREAM_ID}-engineering`,
    topicName: encodeURIComponent(TOPIC),
    dmIdParam: undefined as string | undefined,
    updateMessageFlagsInStore: useCurrentChatMessagesStore.getState().updateMessageFlags,
    ...overrides,
  };
}

describe("useChatPageMarkRead", () => {
  beforeEach(() => {
    useChatListStore.getState().clear();
    useInboxStore.getState().clear();
    useCurrentChatMessagesStore.getState().setContext(null);
    vi.mocked(markMessagesAsRead).mockResolvedValue(undefined);
    vi.mocked(applyOpenChatMarkAllAsRead).mockResolvedValue(true);
    useShortcutMock.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("applies optimistic read when visible unread ids are scheduled", () => {
    const message = streamTopicMessage();
    const context: CurrentChatContext = {
      type: "stream",
      streamId: STREAM_ID,
      streamName: "engineering",
      topic: TOPIC,
      streamWideView: false,
    };
    useCurrentChatMessagesStore.setState({ context, messages: [message] });
    useChatListStore.getState().setFromMessages([message], CURRENT_USER_ID);

    const { result } = renderHook(() =>
      useChatPageMarkRead(defaultParams({ messages: [message] })),
    );

    act(() => {
      result.current.handleUnreadMessagesVisible([MESSAGE_ID]);
    });

    expect(useCurrentChatMessagesStore.getState().messages[0]?.flags).toContain("read");
    expect(
      useChatListStore.getState().streamsMap.get(STREAM_ID)?.topics.get(TOPIC)?.unreadCount,
    ).toBe(0);
  });

  it("incrementally updates inbox store on optimistic read", () => {
    useInboxStore.getState().setEntries([
      {
        key: `stream:${STREAM_ID}:${TOPIC}`,
        streamId: STREAM_ID,
        streamName: "engineering",
        topic: TOPIC,
        senderId: null,
        senderName: null,
        dmSlug: null,
        unreadCount: 2,
        lastMessageTimestamp: 100,
        messageIds: [MESSAGE_ID, 502],
      },
    ]);

    const message = streamTopicMessage();
    const { result } = renderHook(() =>
      useChatPageMarkRead(defaultParams({ messages: [message] })),
    );

    act(() => {
      result.current.handleUnreadMessagesVisible([MESSAGE_ID]);
    });

    const entries = useInboxStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]!.unreadCount).toBe(1);
    expect(entries[0]!.messageIds).toEqual([502]);
  });

  it("skips scheduling when stream route has no active topic", () => {
    const { result } = renderHook(() =>
      useChatPageMarkRead(
        defaultParams({
          activeTopic: undefined,
          topicName: undefined,
        }),
      ),
    );

    act(() => {
      result.current.handleUnreadMessagesVisible([MESSAGE_ID]);
    });

    expect(markMessagesAsRead).not.toHaveBeenCalled();
  });

  it("flushes scheduled ids through markMessagesAsRead after debounce", async () => {
    vi.useFakeTimers();
    const message = streamTopicMessage();
    const { result } = renderHook(() =>
      useChatPageMarkRead(defaultParams({ messages: [message] })),
    );

    act(() => {
      result.current.handleUnreadMessagesVisible([MESSAGE_ID]);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(markMessagesAsRead).toHaveBeenCalledTimes(1);
    expect(markMessagesAsRead).toHaveBeenCalledWith([MESSAGE_ID]);
  });

  it("handleMarkAllAsRead delegates to applyOpenChatMarkAllAsRead", async () => {
    const message = streamTopicMessage();
    const { result } = renderHook(() =>
      useChatPageMarkRead(defaultParams({ messages: [message] })),
    );

    act(() => {
      result.current.handleMarkAllAsRead();
    });

    await waitFor(() => {
      expect(applyOpenChatMarkAllAsRead).toHaveBeenCalledTimes(1);
    });
    expect(applyOpenChatMarkAllAsRead).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { type: "topic", streamId: STREAM_ID, topic: TOPIC },
        loadedMessages: [message],
        currentUserId: CURRENT_USER_ID,
      }),
    );
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

  it("cancels pending batch when route identity changes", async () => {
    vi.useFakeTimers();
    const message = streamTopicMessage();
    const { result, rerender } = renderHook(
      (params: ReturnType<typeof defaultParams>) => useChatPageMarkRead(params),
      { initialProps: defaultParams({ messages: [message] }) },
    );

    act(() => {
      result.current.handleUnreadMessagesVisible([MESSAGE_ID]);
    });

    rerender(
      defaultParams({
        messages: [message],
        streamSlug: `${STREAM_ID}-engineering`,
        topicName: encodeURIComponent("incident"),
        activeTopic: "incident",
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(markMessagesAsRead).not.toHaveBeenCalled();
  });
});
