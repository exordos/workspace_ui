import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyOpenChatMarkAllAsRead } from "./chat-mark-all-read.lib";
import { useChatPageMarkRead } from "./chat-page-mark-read.hook";

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
const TOPIC = "general";
const MESSAGE_ID = "00000000-0000-4000-8000-000000000501";

function defaultParams(overrides: Partial<Parameters<typeof useChatPageMarkRead>[0]> = {}) {
  return {
    currentUserId: CURRENT_USER_ID,
    isDmView: false,
    activeDmUserIds: null as number[] | null,
    activeStreamId: STREAM_ID,
    activeTopic: TOPIC,
    streamSlug: STREAM_ID,
    topicName: encodeURIComponent(TOPIC),
    dmIdParam: undefined as string | undefined,
    ...overrides,
  };
}

describe("useChatPageMarkRead", () => {
  beforeEach(() => {
    vi.mocked(applyOpenChatMarkAllAsRead).mockClear();
    vi.mocked(applyOpenChatMarkAllAsRead).mockResolvedValue(true);
    useShortcutMock.mockClear();
  });

  it("ignores viewport unread callbacks", () => {
    const { result } = renderHook(() => useChatPageMarkRead(defaultParams()));

    act(() => {
      result.current.handleUnreadMessagesVisible([MESSAGE_ID]);
      result.current.handleUnreadMessagesAtBottom([MESSAGE_ID]);
    });

    expect(applyOpenChatMarkAllAsRead).not.toHaveBeenCalled();
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
      target: { type: "topic", streamId: STREAM_ID, topic: TOPIC },
      currentUserId: CURRENT_USER_ID,
    });
  });

  it("handleMarkAllAsRead delegates DM target to applyOpenChatMarkAllAsRead", async () => {
    const { result } = renderHook(() =>
      useChatPageMarkRead(
        defaultParams({
          isDmView: true,
          activeDmUserIds: [CURRENT_USER_ID, 42],
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
        target: { type: "dm", userIds: [CURRENT_USER_ID, 42] },
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
