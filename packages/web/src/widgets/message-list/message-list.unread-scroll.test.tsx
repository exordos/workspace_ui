import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockMessage } from "~/shared/api/zulip.types";
import { resetRealmEmojisCacheForTests } from "~/shared/lib/realm-emojis-cache";
import { MessageList } from "./message-list.ui";

const fetchRealmEmojisMock = vi.hoisted(() => vi.fn());
const scrollToBottomMock = vi.hoisted(() => vi.fn());

vi.mock("~/shared/api/zulip-users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/shared/api/zulip-users")>();
  return {
    ...actual,
    fetchRealmEmojis: (...args: unknown[]) => fetchRealmEmojisMock(...args),
  };
});

vi.mock("~/shared/lib/scroll-position.lib", () => ({
  scrollToBottom: (...args: unknown[]) => scrollToBottomMock(...args),
}));

function msg(id: number, overrides: Partial<MockMessage> = {}): MockMessage {
  return {
    id,
    sender_id: 43,
    sender_full_name: "Alice",
    stream_id: 10,
    display_recipient: "general",
    channel: "general",
    subject: "bugs",
    content: `<p>Message ${id}</p>`,
    timestamp: 1710000000 + id,
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
        firstUnreadId={3}
        unreadCount={2}
        scrollToBottomKey="unread-anchor-a"
      />,
    );

    await act(async () => {
      await flushProgrammaticScrollFrames();
    });

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollTargets).toEqual(["3"]);

    rerender(
      <MessageList
        messages={initialMessages.map((m) => (m.id === 3 ? { ...m, flags: ["read"] } : m))}
        currentUserId={7}
        firstUnreadId={4}
        unreadCount={1}
        scrollToBottomKey="unread-anchor-a"
      />,
    );

    await act(async () => {
      await flushProgrammaticScrollFrames();
    });

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollTargets).toEqual(["3"]);
  });

  it("marks a single unread as read after scroll-to-unread without manual scroll", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onUnreadMessagesVisible = vi.fn();
    const unreadId = 3118;
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
    expect(onUnreadMessagesVisible).toHaveBeenCalledWith([unreadId]);
    vi.useRealTimers();
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
        firstUnreadId={2}
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
        intersectionCallback(
          [
            {
              target,
              isIntersecting: true,
              intersectionRatio: 0.5,
              boundingClientRect: {} as DOMRectReadOnly,
              intersectionRect: {} as DOMRectReadOnly,
              rootBounds: null,
              time: 0,
            },
          ],
          this,
        );
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
        firstUnreadId={2}
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

    expect(onUnreadMessagesVisible).not.toHaveBeenCalled();
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
        firstUnreadId={105}
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
        firstUnreadId={105}
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
        firstUnreadId={2}
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
        firstUnreadId={2}
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
        firstUnreadId={2}
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

  it("keeps tail pinned when viewport height shrinks while already at bottom", async () => {
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

    expect(scrollToBottomMock.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("auto-scrolls when list was at bottom before message append", async () => {
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

    expect(scrollToBottomMock.mock.calls.length).toBeGreaterThanOrEqual(1);
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

describe("MessageList chat open scroll to bottom", () => {
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

  it("scrolls to bottom on chat open when there are no unreads", async () => {
    const base = [
      msg(1, { sender_id: 99, flags: ["read"] }),
      msg(2, { sender_id: 43, flags: ["read"] }),
      msg(3, { sender_id: 43, flags: ["read"] }),
    ];

    render(<MessageList messages={base} currentUserId={7} scrollToBottomKey="open-no-unread" />);

    await flushOpenScroll();

    expect(scrollToBottomMock).toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("scrolls to bottom when transient unread clears on chat open", async () => {
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
        firstUnreadId={2}
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

    expect(scrollToBottomMock).toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("pins tail with follow-up scroll on chat open", async () => {
    const base = [
      msg(1, { sender_id: 99, flags: ["read"] }),
      msg(2, { sender_id: 43, flags: ["read"] }),
    ];

    render(<MessageList messages={base} currentUserId={7} scrollToBottomKey="open-double-pin" />);

    await flushOpenScroll();

    expect(scrollToBottomMock.mock.calls.length).toBeGreaterThanOrEqual(2);
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
        focusedMessageId={25}
      />,
    );

    await flushOpenScroll();

    expect(scrollIntoView).toHaveBeenCalled();
    expect(scrollTargets).toContain("25");
    expect(scrollToBottomMock).not.toHaveBeenCalled();
  });
});
