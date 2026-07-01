import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as MessengerUsersApi from "~/shared/api/messenger-users";
import type { MockMessage } from "~/shared/api/messenger.types";
import { resetRealmEmojisCacheForTests } from "~/shared/lib/realm-emojis-cache";
import { testMessageId, testMessageOrdinal } from "~/test/factories";
import { MessageList } from "./message-list.ui";

const fetchRealmEmojisMock = vi.hoisted(() => vi.fn());
const scrollToBottomMock = vi.hoisted(() => vi.fn());

vi.mock("~/shared/api/messenger-users", async (importOriginal) => {
  const actual = await importOriginal<typeof MessengerUsersApi>();
  return {
    ...actual,
    fetchRealmEmojis: (...args: unknown[]) => fetchRealmEmojisMock(...args),
  };
});

vi.mock("~/shared/lib/scroll-position.lib", () => ({
  scrollToBottom: (...args: unknown[]) => scrollToBottomMock(...args),
}));

function msg(id: number | string, overrides: Partial<MockMessage> = {}): MockMessage {
  return {
    id: testMessageId(id),
    sender_id: 43,
    sender_full_name: "Alice",
    stream_uuid: "00000000-0000-4000-8000-000000000010",
    display_recipient: "general",
    channel: "general",
    subject: "bugs",
    content: `<p>Message ${id}</p>`,
    timestamp: 1710000000 + testMessageOrdinal(id),
    ...overrides,
  };
}

function flushProgrammaticScrollFrames(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  });
}

async function advanceVisibleTailFlush(): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(500);
    await flushProgrammaticScrollFrames();
  });
}

function stubVisibleTailLayout(
  root: HTMLElement,
  rectsByMessageId: Record<number, { top: number; bottom: number }>,
): void {
  const rootRect = {
    top: 0,
    bottom: 400,
    left: 0,
    right: 300,
    width: 300,
    height: 400,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
  vi.spyOn(root, "getBoundingClientRect").mockReturnValue(rootRect);

  for (const [rawMessageId, rect] of Object.entries(rectsByMessageId)) {
    const messageId = testMessageId(Number(rawMessageId));
    const node = root.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
    if (node == null) {
      throw new Error(`expected node for message ${messageId}`);
    }
    vi.spyOn(node, "getBoundingClientRect").mockReturnValue({
      top: rect.top,
      bottom: rect.bottom,
      left: 0,
      right: 300,
      width: 300,
      height: rect.bottom - rect.top,
      x: 0,
      y: rect.top,
      toJSON: () => ({}),
    });
  }
}

describe("MessageList unread anchor scroll", () => {
  const scrollTargets: string[] = [];
  const scrollIntoView = vi.fn(function (this: HTMLElement) {
    scrollTargets.push(this.getAttribute("data-message-id") ?? "");
  });
  const originalIntersectionObserver = globalThis.IntersectionObserver;
  const originalResizeObserver = globalThis.ResizeObserver;

  class IntersectionObserverMock implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = "0px";
    readonly scrollMargin = "0px";
    readonly thresholds = [0.5];
    disconnect = vi.fn();
    observe = vi.fn();
    takeRecords = vi.fn(() => []);
    unobserve = vi.fn();

    constructor(
      _callback: (entries: IntersectionObserverEntry[], observer: IntersectionObserver) => void,
    ) {}
  }

  beforeEach(() => {
    resetRealmEmojisCacheForTests();
    scrollTargets.length = 0;
    scrollIntoView.mockReset();
    scrollToBottomMock.mockReset();
    fetchRealmEmojisMock.mockReset();
    fetchRealmEmojisMock.mockResolvedValue([]);
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    globalThis.IntersectionObserver = IntersectionObserverMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.IntersectionObserver = originalIntersectionObserver;
    globalThis.ResizeObserver = originalResizeObserver;
  });

  it("scrolls to initial unread anchor only once when firstUnreadId advances after read", async () => {
    const initialMessages = [
      msg(1, { sender_id: 99, flags: ["read"] }),
      msg(2, { sender_id: 99, flags: ["read"] }),
      msg(3, { sender_id: 43, flags: [] }),
      msg(4, { sender_id: 43, flags: [] }),
    ];

    const { rerender } = render(
      <MessageList
        messages={initialMessages}
        currentUserId={7}
        firstUnreadId={testMessageId(3)}
        unreadCount={2}
        scrollToBottomKey="unread-anchor-a"
      />,
    );

    await act(async () => {
      await flushProgrammaticScrollFrames();
    });

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollTargets).toEqual([testMessageId(3)]);

    rerender(
      <MessageList
        messages={initialMessages.map((m) =>
          m.id === testMessageId(3) ? { ...m, flags: ["read"] } : m,
        )}
        currentUserId={7}
        firstUnreadId={testMessageId(4)}
        unreadCount={1}
        scrollToBottomKey="unread-anchor-a"
      />,
    );

    await act(async () => {
      await flushProgrammaticScrollFrames();
    });

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollTargets).toEqual([testMessageId(3)]);
  });

  it("scrolls to a single unread anchor without marking it locally", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const onUnreadMessagesVisible = vi.fn();
      const unreadId = testMessageId(3118);
      const messages = [
        msg(1, { sender_id: 99, flags: ["read"] }),
        msg(2, { sender_id: 43, flags: ["read"] }),
        msg(unreadId, { sender_id: 43, flags: [] }),
      ];

      render(
        <MessageList
          messages={messages}
          currentUserId={7}
          firstUnreadId={unreadId}
          unreadCount={1}
          scrollToBottomKey="single-unread-autoread"
          onUnreadMessagesVisible={onUnreadMessagesVisible}
        />,
      );

      const feed = document.querySelector('[role="feed"]') as HTMLDivElement;
      const anchor = feed.querySelector<HTMLElement>(`[data-message-id="${unreadId}"]`);
      if (anchor == null) {
        throw new Error("expected unread anchor node");
      }
      const rootRect = {
        top: 0,
        bottom: 400,
        left: 0,
        right: 300,
        width: 300,
        height: 400,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
      const anchorRect = {
        top: 150,
        bottom: 200,
        left: 0,
        right: 300,
        width: 300,
        height: 50,
        x: 0,
        y: 150,
        toJSON: () => ({}),
      } as DOMRect;
      vi.spyOn(feed, "getBoundingClientRect").mockReturnValue(rootRect);
      vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue(anchorRect);

      await act(async () => {
        await flushProgrammaticScrollFrames();
      });

      await act(async () => {
        vi.advanceTimersByTime(500);
        await flushProgrammaticScrollFrames();
      });

      expect(scrollIntoView).toHaveBeenCalled();
      expect(onUnreadMessagesVisible).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not auto-mark unread at bottom before user scroll on chat open", async () => {
    const onUnreadMessagesVisible = vi.fn();
    const messages = [
      msg(1, { sender_id: 99, flags: ["read"] }),
      msg(2, { sender_id: 43, flags: [] }),
      msg(3, { sender_id: 43, flags: [] }),
      msg(4, { sender_id: 43, flags: [] }),
      msg(5, { sender_id: 43, flags: [] }),
    ];

    render(
      <MessageList
        messages={messages}
        currentUserId={7}
        firstUnreadId={"00000000-0000-4000-8000-000000000002"}
        unreadCount={4}
        scrollToBottomKey="unread-no-autoread"
        onUnreadMessagesVisible={onUnreadMessagesVisible}
      />,
    );

    const feed = document.querySelector('[role="feed"]') as HTMLDivElement;
    Object.defineProperty(feed, "scrollHeight", { configurable: true, value: 2000 });
    Object.defineProperty(feed, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(feed, "scrollTop", { configurable: true, writable: true, value: 1600 });

    await act(async () => {
      await flushProgrammaticScrollFrames();
    });

    expect(onUnreadMessagesVisible).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it("does not mark intersection-visible unreads before user scroll", async () => {
    let intersectionCallback: IntersectionObserverCallback = () => {};
    const observedTargets: Element[] = [];

    class ImmediateIntersectionObserverMock implements IntersectionObserver {
      readonly root = null;
      readonly rootMargin = "0px";
      readonly scrollMargin = "0px";
      readonly thresholds = [0.5];
      disconnect = vi.fn();
      unobserve = vi.fn();
      takeRecords = vi.fn(() => []);

      constructor(callback: IntersectionObserverCallback) {
        intersectionCallback = callback;
      }

      observe = vi.fn((target: Element) => {
        observedTargets.push(target);
      });
    }

    globalThis.IntersectionObserver = ImmediateIntersectionObserverMock;

    const onUnreadMessagesVisible = vi.fn();
    const messages = [
      msg(1, { sender_id: 99, flags: ["read"] }),
      msg(2, { sender_id: 43, flags: [] }),
      msg(3, { sender_id: 43, flags: [] }),
      msg(4, { sender_id: 43, flags: [] }),
    ];

    render(
      <MessageList
        messages={messages}
        currentUserId={7}
        firstUnreadId={"00000000-0000-4000-8000-000000000002"}
        unreadCount={3}
        scrollToBottomKey="unread-io-defer"
        onUnreadMessagesVisible={onUnreadMessagesVisible}
      />,
    );

    const feed = document.querySelector('[role="feed"]') as HTMLDivElement;
    Object.defineProperty(feed, "scrollHeight", { configurable: true, value: 2000 });
    Object.defineProperty(feed, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(feed, "scrollTop", { configurable: true, writable: true, value: 1600 });

    await act(async () => {
      await flushProgrammaticScrollFrames();
    });

    intersectionCallback(
      observedTargets.map((target) => ({
        target,
        isIntersecting: true,
        intersectionRatio: 0.5,
        boundingClientRect: {} as DOMRectReadOnly,
        intersectionRect: {} as DOMRectReadOnly,
        rootBounds: null,
        time: 0,
      })),
      {} as IntersectionObserver,
    );

    expect(onUnreadMessagesVisible).not.toHaveBeenCalled();
  });

  it("does not mark fully visible unread tail without a server read update", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const onUnreadMessagesVisible = vi.fn();
      const onUnreadMessagesAtBottom = vi.fn();
      render(
        <MessageList
          messages={[
            msg(1, { sender_id: 99, flags: ["read"] }),
            msg(2, { sender_id: 43, flags: [] }),
            msg(3, { sender_id: 43, flags: [] }),
          ]}
          currentUserId={7}
          firstUnreadId={"00000000-0000-4000-8000-000000000002"}
          unreadCount={2}
          scrollToBottomKey="visible-tail-complete"
          onUnreadMessagesVisible={onUnreadMessagesVisible}
          onUnreadMessagesAtBottom={onUnreadMessagesAtBottom}
        />,
      );

      const feed = document.querySelector('[role="feed"]') as HTMLDivElement;
      Object.defineProperty(feed, "scrollHeight", { configurable: true, value: 2000 });
      Object.defineProperty(feed, "clientHeight", { configurable: true, value: 400 });
      Object.defineProperty(feed, "scrollTop", { configurable: true, writable: true, value: 1600 });
      stubVisibleTailLayout(feed, {
        2: { top: 260, bottom: 310 },
        3: { top: 330, bottom: 380 },
      });

      await advanceVisibleTailFlush();

      expect(onUnreadMessagesVisible).not.toHaveBeenCalled();
      expect(onUnreadMessagesAtBottom).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not mark visible tail before newer messages boundary is confirmed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const onUnreadMessagesVisible = vi.fn();
      render(
        <MessageList
          messages={[
            msg(1, { sender_id: 99, flags: ["read"] }),
            msg(2, { sender_id: 43, flags: [] }),
            msg(3, { sender_id: 43, flags: [] }),
          ]}
          currentUserId={7}
          firstUnreadId={"00000000-0000-4000-8000-000000000002"}
          unreadCount={2}
          scrollToBottomKey="visible-tail-has-newer"
          hasNewerMessages
          onUnreadMessagesVisible={onUnreadMessagesVisible}
        />,
      );

      const feed = document.querySelector('[role="feed"]') as HTMLDivElement;
      Object.defineProperty(feed, "scrollHeight", { configurable: true, value: 2000 });
      Object.defineProperty(feed, "clientHeight", { configurable: true, value: 400 });
      Object.defineProperty(feed, "scrollTop", { configurable: true, writable: true, value: 1600 });
      stubVisibleTailLayout(feed, {
        2: { top: 260, bottom: 310 },
        3: { top: 330, bottom: 380 },
      });

      await advanceVisibleTailFlush();

      expect(onUnreadMessagesVisible).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not mark visible tail while newer page is still loading", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const onUnreadMessagesVisible = vi.fn();
      render(
        <MessageList
          messages={[
            msg(1, { sender_id: 99, flags: ["read"] }),
            msg(2, { sender_id: 43, flags: [] }),
            msg(3, { sender_id: 43, flags: [] }),
          ]}
          currentUserId={7}
          firstUnreadId={"00000000-0000-4000-8000-000000000002"}
          unreadCount={2}
          scrollToBottomKey="visible-tail-loading-newer"
          isLoadingNewer
          onUnreadMessagesVisible={onUnreadMessagesVisible}
        />,
      );

      const feed = document.querySelector('[role="feed"]') as HTMLDivElement;
      Object.defineProperty(feed, "scrollHeight", { configurable: true, value: 2000 });
      Object.defineProperty(feed, "clientHeight", { configurable: true, value: 400 });
      Object.defineProperty(feed, "scrollTop", { configurable: true, writable: true, value: 1600 });
      stubVisibleTailLayout(feed, {
        2: { top: 260, bottom: 310 },
        3: { top: 330, bottom: 380 },
      });

      await advanceVisibleTailFlush();

      expect(onUnreadMessagesVisible).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not mark visible tail when loaded unread candidates are incomplete", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const onUnreadMessagesVisible = vi.fn();
      render(
        <MessageList
          messages={[
            msg(1, { sender_id: 99, flags: ["read"] }),
            msg(2, { sender_id: 43, flags: [] }),
            msg(3, { sender_id: 43, flags: [] }),
          ]}
          currentUserId={7}
          firstUnreadId={"00000000-0000-4000-8000-000000000002"}
          unreadCount={3}
          scrollToBottomKey="visible-tail-incomplete-window"
          onUnreadMessagesVisible={onUnreadMessagesVisible}
        />,
      );

      const feed = document.querySelector('[role="feed"]') as HTMLDivElement;
      Object.defineProperty(feed, "scrollHeight", { configurable: true, value: 2000 });
      Object.defineProperty(feed, "clientHeight", { configurable: true, value: 400 });
      Object.defineProperty(feed, "scrollTop", { configurable: true, writable: true, value: 1600 });
      stubVisibleTailLayout(feed, {
        2: { top: 260, bottom: 310 },
        3: { top: 330, bottom: 380 },
      });

      await advanceVisibleTailFlush();

      expect(onUnreadMessagesVisible).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not mark visible tail when only part of unread candidates is visible", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const onUnreadMessagesVisible = vi.fn();
      render(
        <MessageList
          messages={[
            msg(1, { sender_id: 99, flags: ["read"] }),
            msg(2, { sender_id: 43, flags: [] }),
            msg(3, { sender_id: 43, flags: [] }),
          ]}
          currentUserId={7}
          firstUnreadId={"00000000-0000-4000-8000-000000000002"}
          unreadCount={2}
          scrollToBottomKey="visible-tail-partial"
          onUnreadMessagesVisible={onUnreadMessagesVisible}
        />,
      );

      const feed = document.querySelector('[role="feed"]') as HTMLDivElement;
      Object.defineProperty(feed, "scrollHeight", { configurable: true, value: 2000 });
      Object.defineProperty(feed, "clientHeight", { configurable: true, value: 400 });
      Object.defineProperty(feed, "scrollTop", { configurable: true, writable: true, value: 1600 });
      stubVisibleTailLayout(feed, {
        2: { top: -30, bottom: 10 },
        3: { top: 330, bottom: 380 },
      });

      await advanceVisibleTailFlush();

      expect(onUnreadMessagesVisible).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps scroll protection for long chats when the full unread tail is not visible", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const onUnreadMessagesVisible = vi.fn();
      render(
        <MessageList
          messages={[
            msg(1, { sender_id: 99, flags: ["read"] }),
            msg(2, { sender_id: 43, flags: [] }),
            msg(3, { sender_id: 43, flags: [] }),
            msg(4, { sender_id: 43, flags: [] }),
          ]}
          currentUserId={7}
          firstUnreadId={"00000000-0000-4000-8000-000000000002"}
          unreadCount={3}
          scrollToBottomKey="visible-tail-long-chat"
          onUnreadMessagesVisible={onUnreadMessagesVisible}
        />,
      );

      const feed = document.querySelector('[role="feed"]') as HTMLDivElement;
      Object.defineProperty(feed, "scrollHeight", { configurable: true, value: 2600 });
      Object.defineProperty(feed, "clientHeight", { configurable: true, value: 400 });
      Object.defineProperty(feed, "scrollTop", { configurable: true, writable: true, value: 2200 });
      stubVisibleTailLayout(feed, {
        2: { top: -80, bottom: -20 },
        3: { top: 250, bottom: 300 },
        4: { top: 330, bottom: 380 },
      });

      await advanceVisibleTailFlush();

      expect(onUnreadMessagesVisible).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not auto-mark unread after API shrinks list while anchor is active", async () => {
    const onUnreadMessagesVisible = vi.fn();
    const cachedWindow = Array.from({ length: 10 }, (_, i) =>
      msg(100 + i, {
        sender_id: i < 5 ? 99 : 43,
        flags: i < 5 ? ["read"] : [],
      }),
    );
    const apiWindow = cachedWindow.slice(-5);

    const { rerender } = render(
      <MessageList
        messages={cachedWindow}
        currentUserId={7}
        firstUnreadId={"00000000-0000-4000-8000-000000000105"}
        unreadCount={5}
        scrollToBottomKey="unread-api-shrink"
        onUnreadMessagesVisible={onUnreadMessagesVisible}
      />,
    );

    const feed = document.querySelector('[role="feed"]') as HTMLDivElement;
    Object.defineProperty(feed, "scrollHeight", { configurable: true, value: 3000 });
    Object.defineProperty(feed, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(feed, "scrollTop", { configurable: true, writable: true, value: 2600 });

    await act(async () => {
      await flushProgrammaticScrollFrames();
    });

    onUnreadMessagesVisible.mockClear();
    scrollToBottomMock.mockClear();

    rerender(
      <MessageList
        messages={apiWindow}
        currentUserId={7}
        firstUnreadId={"00000000-0000-4000-8000-000000000105"}
        unreadCount={5}
        scrollToBottomKey="unread-api-shrink"
        onUnreadMessagesVisible={onUnreadMessagesVisible}
      />,
    );

    await act(async () => {
      await flushProgrammaticScrollFrames();
    });

    expect(onUnreadMessagesVisible).not.toHaveBeenCalled();
    expect(scrollToBottomMock).not.toHaveBeenCalled();
  });

  it("does not scroll to bottom when messages grow with unread anchor before user scroll", async () => {
    const base = [
      msg(1, { sender_id: 99, flags: ["read"] }),
      msg(2, { sender_id: 43, flags: [] }),
      msg(3, { sender_id: 43, flags: [] }),
    ];

    const { rerender } = render(
      <MessageList
        messages={base}
        currentUserId={7}
        firstUnreadId={"00000000-0000-4000-8000-000000000002"}
        unreadCount={2}
        scrollToBottomKey="unread-anchor-b"
      />,
    );

    const feed = document.querySelector('[role="feed"]') as HTMLDivElement;
    Object.defineProperty(feed, "scrollHeight", { configurable: true, value: 2000 });
    Object.defineProperty(feed, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(feed, "scrollTop", { configurable: true, writable: true, value: 200 });

    await act(async () => {
      await flushProgrammaticScrollFrames();
    });

    scrollToBottomMock.mockClear();

    rerender(
      <MessageList
        messages={[msg(0, { sender_id: 99, flags: ["read"] }), ...base]}
        currentUserId={7}
        firstUnreadId={"00000000-0000-4000-8000-000000000002"}
        unreadCount={2}
        scrollToBottomKey="unread-anchor-b"
      />,
    );

    await act(async () => {
      await flushProgrammaticScrollFrames();
    });

    expect(scrollToBottomMock).not.toHaveBeenCalled();
  });

  it("does not pin tail on viewport resize while unread anchor is active before user scroll", async () => {
    let resizeCallback: ResizeObserverCallback = () => {};

    class ResizeObserverMock implements ResizeObserver {
      disconnect = vi.fn();
      observe = vi.fn();
      unobserve = vi.fn();

      constructor(cb: ResizeObserverCallback) {
        resizeCallback = cb;
      }
    }
    globalThis.ResizeObserver = ResizeObserverMock;

    const messages = [
      msg(1, { sender_id: 99, flags: ["read"] }),
      msg(2, { sender_id: 43, flags: [] }),
      msg(3, { sender_id: 43, flags: [] }),
    ];

    render(
      <MessageList
        messages={messages}
        currentUserId={7}
        firstUnreadId={"00000000-0000-4000-8000-000000000002"}
        unreadCount={2}
        scrollToBottomKey="resize-skip-unread"
      />,
    );

    const feed = document.querySelector('[role="feed"]') as HTMLDivElement;
    Object.defineProperty(feed, "scrollHeight", { configurable: true, value: 2000 });
    Object.defineProperty(feed, "clientHeight", { configurable: true, value: 500 });
    Object.defineProperty(feed, "scrollTop", { configurable: true, writable: true, value: 200 });

    await act(async () => {
      await flushProgrammaticScrollFrames();
    });

    scrollToBottomMock.mockClear();
    Object.defineProperty(feed, "clientHeight", { configurable: true, value: 380 });
    resizeCallback([], {} as ResizeObserver);

    await act(async () => {
      await flushProgrammaticScrollFrames();
    });

    expect(scrollToBottomMock).not.toHaveBeenCalled();
  });

  it("does not pin tail when viewport height shrinks while already at bottom", async () => {
    let resizeCallback: ResizeObserverCallback = () => {};

    class ResizeObserverMock implements ResizeObserver {
      disconnect = vi.fn();
      observe = vi.fn();
      unobserve = vi.fn();

      constructor(cb: ResizeObserverCallback) {
        resizeCallback = cb;
      }
    }
    globalThis.ResizeObserver = ResizeObserverMock;

    const base = [
      msg(1, { sender_id: 99, flags: ["read"] }),
      msg(2, { sender_id: 43, flags: ["read"] }),
      msg(3, { sender_id: 43, flags: ["read"] }),
    ];

    render(<MessageList messages={base} currentUserId={7} scrollToBottomKey="resize-pin-tail" />);

    const feed = document.querySelector('[role="feed"]') as HTMLDivElement;
    Object.defineProperty(feed, "scrollHeight", { configurable: true, value: 2000 });
    Object.defineProperty(feed, "clientHeight", { configurable: true, value: 500 });
    Object.defineProperty(feed, "scrollTop", { configurable: true, writable: true, value: 1500 });

    fireEvent.scroll(feed);
    scrollToBottomMock.mockClear();

    Object.defineProperty(feed, "clientHeight", { configurable: true, value: 380 });
    resizeCallback([], {} as ResizeObserver);

    await act(async () => {
      await flushProgrammaticScrollFrames();
    });

    expect(scrollToBottomMock).not.toHaveBeenCalled();
  });

  it("does not auto-scroll when list was at bottom before message append", async () => {
    const base = [
      msg(1, { sender_id: 99, flags: ["read"] }),
      msg(2, { sender_id: 43, flags: ["read"] }),
      msg(3, { sender_id: 43, flags: ["read"] }),
    ];

    const { rerender } = render(
      <MessageList messages={base} currentUserId={7} scrollToBottomKey="tail-follow-append" />,
    );

    const feed = document.querySelector('[role="feed"]') as HTMLDivElement;
    Object.defineProperty(feed, "scrollHeight", { configurable: true, value: 2000 });
    Object.defineProperty(feed, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(feed, "scrollTop", { configurable: true, writable: true, value: 1600 });
    fireEvent.scroll(feed);

    scrollToBottomMock.mockClear();

    rerender(
      <MessageList
        messages={[...base, msg(4, { sender_id: 99, flags: [] })]}
        currentUserId={7}
        scrollToBottomKey="tail-follow-append"
      />,
    );
    Object.defineProperty(feed, "scrollHeight", { configurable: true, value: 2400 });

    await act(async () => {
      await flushProgrammaticScrollFrames();
    });

    expect(scrollToBottomMock).not.toHaveBeenCalled();
  });

  it("does not auto-scroll when user scrolled up before incoming message", async () => {
    const base = [
      msg(1, { sender_id: 99, flags: ["read"] }),
      msg(2, { sender_id: 43, flags: ["read"] }),
      msg(3, { sender_id: 43, flags: ["read"] }),
    ];

    const { rerender } = render(
      <MessageList messages={base} currentUserId={7} scrollToBottomKey="tail-follow-no-scroll" />,
    );

    const feed = document.querySelector('[role="feed"]') as HTMLDivElement;
    Object.defineProperty(feed, "scrollHeight", { configurable: true, value: 2000 });
    Object.defineProperty(feed, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(feed, "scrollTop", { configurable: true, writable: true, value: 200 });
    fireEvent.scroll(feed);

    await act(async () => {
      await flushProgrammaticScrollFrames();
    });

    scrollToBottomMock.mockClear();

    rerender(
      <MessageList
        messages={[...base, msg(4, { sender_id: 99, flags: [] })]}
        currentUserId={7}
        scrollToBottomKey="tail-follow-no-scroll"
      />,
    );
    Object.defineProperty(feed, "scrollHeight", { configurable: true, value: 2400 });

    await act(async () => {
      await flushProgrammaticScrollFrames();
    });

    expect(scrollToBottomMock).not.toHaveBeenCalled();
  });

  it("does not auto-scroll on wheel-up before incoming message", async () => {
    const base = [
      msg(1, { sender_id: 99, flags: ["read"] }),
      msg(2, { sender_id: 43, flags: ["read"] }),
      msg(3, { sender_id: 43, flags: ["read"] }),
    ];

    const { rerender } = render(
      <MessageList messages={base} currentUserId={7} scrollToBottomKey="tail-follow-wheel-up" />,
    );

    const feed = document.querySelector('[role="feed"]') as HTMLDivElement;
    Object.defineProperty(feed, "scrollHeight", { configurable: true, value: 2000 });
    Object.defineProperty(feed, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(feed, "scrollTop", { configurable: true, writable: true, value: 1600 });

    await act(async () => {
      await flushProgrammaticScrollFrames();
    });

    fireEvent.wheel(feed, { deltaY: -50 });

    await act(async () => {
      await flushProgrammaticScrollFrames();
    });

    scrollToBottomMock.mockClear();

    rerender(
      <MessageList
        messages={[...base, msg(4, { sender_id: 99, flags: [] })]}
        currentUserId={7}
        scrollToBottomKey="tail-follow-wheel-up"
      />,
    );
    Object.defineProperty(feed, "scrollHeight", { configurable: true, value: 2400 });

    await act(async () => {
      await flushProgrammaticScrollFrames();
    });

    expect(scrollToBottomMock).not.toHaveBeenCalled();
  });
});

describe("MessageList chat open without scroll to bottom", () => {
  const scrollTargets: string[] = [];
  const scrollIntoView = vi.fn(function (this: HTMLElement) {
    scrollTargets.push(this.getAttribute("data-message-id") ?? "");
  });
  const originalIntersectionObserver = globalThis.IntersectionObserver;

  class IntersectionObserverMock implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = "0px";
    readonly scrollMargin = "0px";
    readonly thresholds = [0.5];
    disconnect = vi.fn();
    observe = vi.fn();
    takeRecords = vi.fn(() => []);
    unobserve = vi.fn();

    constructor(
      _callback: (entries: IntersectionObserverEntry[], observer: IntersectionObserver) => void,
    ) {}
  }

  beforeEach(() => {
    resetRealmEmojisCacheForTests();
    scrollTargets.length = 0;
    scrollIntoView.mockReset();
    scrollToBottomMock.mockReset();
    fetchRealmEmojisMock.mockReset();
    fetchRealmEmojisMock.mockResolvedValue([]);
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    globalThis.IntersectionObserver = IntersectionObserverMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.IntersectionObserver = originalIntersectionObserver;
  });

  async function flushOpenScroll(): Promise<void> {
    await act(async () => {
      await flushProgrammaticScrollFrames();
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });
  }

  it("does not scroll to bottom on chat open when there are no unreads", async () => {
    const base = [
      msg(1, { sender_id: 99, flags: ["read"] }),
      msg(2, { sender_id: 43, flags: ["read"] }),
      msg(3, { sender_id: 43, flags: ["read"] }),
    ];

    render(<MessageList messages={base} currentUserId={7} scrollToBottomKey="open-no-unread" />);

    await flushOpenScroll();

    expect(scrollToBottomMock).not.toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("does not scroll to bottom when transient unread clears on chat open", async () => {
    const withTransientUnread = [
      msg(1, { sender_id: 99, flags: ["read"] }),
      msg(2, { sender_id: 43, flags: [] }),
      msg(3, { sender_id: 43, flags: ["read"] }),
    ];
    const allRead = withTransientUnread.map((m) => ({ ...m, flags: ["read"] }));

    const { rerender } = render(
      <MessageList
        messages={withTransientUnread}
        currentUserId={7}
        firstUnreadId={testMessageId(2)}
        unreadCount={1}
        scrollToBottomKey="open-recovery"
      />,
    );

    await flushOpenScroll();
    scrollToBottomMock.mockClear();
    scrollIntoView.mockClear();

    rerender(
      <MessageList
        messages={allRead}
        currentUserId={7}
        unreadCount={0}
        scrollToBottomKey="open-recovery"
      />,
    );

    await flushOpenScroll();

    expect(scrollToBottomMock).not.toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("does not pin tail with follow-up scroll on chat open", async () => {
    const base = [
      msg(1, { sender_id: 99, flags: ["read"] }),
      msg(2, { sender_id: 43, flags: ["read"] }),
    ];

    render(<MessageList messages={base} currentUserId={7} scrollToBottomKey="open-double-pin" />);

    await flushOpenScroll();

    expect(scrollToBottomMock).not.toHaveBeenCalled();
  });

  it("scrolls focused message into view on chat open without pinning tail", async () => {
    const base = Array.from({ length: 50 }, (_, index) =>
      msg(index + 1, {
        sender_id: index % 2 === 0 ? 99 : 43,
        flags: ["read"],
      }),
    );

    render(
      <MessageList
        messages={base}
        currentUserId={7}
        scrollToBottomKey="anchor-open"
        focusedMessageId={testMessageId(25)}
      />,
    );

    await flushOpenScroll();

    expect(scrollIntoView).toHaveBeenCalled();
    expect(scrollTargets).toContain(testMessageId(25));
    expect(scrollToBottomMock).not.toHaveBeenCalled();
  });
});
