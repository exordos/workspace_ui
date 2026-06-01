import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockMessage } from "~/shared/api/zulip.types";
import { resetRealmEmojisCacheForTests } from "~/shared/lib/realm-emojis-cache";
import { MessageList } from "./message-list.ui";

const fetchRealmEmojisMock = vi.hoisted(() => vi.fn());
const scrollToBottomMock = vi.hoisted(() => vi.fn());

vi.mock("~/shared/api/zulip", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/shared/api/zulip")>();
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

    expect(scrollToBottomMock).toHaveBeenCalledTimes(1);
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

    expect(scrollToBottomMock).toHaveBeenCalledTimes(1);
  });
});
