import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockMessage } from "~/shared/api/zulip.types";
import { resetRealmEmojisCacheForTests } from "~/shared/lib/realm-emojis-cache";
import { MessageList } from "./message-list.ui";

const fetchRealmEmojisMock = vi.hoisted(() => vi.fn());

vi.mock("~/shared/api/zulip-users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/shared/api/zulip-users")>();
  return {
    ...actual,
    fetchRealmEmojis: (...args: unknown[]) => fetchRealmEmojisMock(...args),
  };
});

function msg(id: number, overrides: Partial<MockMessage> = {}): MockMessage {
  return {
    id,
    sender_id: 42,
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

function dispatchUserScroll(feed: HTMLDivElement): void {
  fireEvent.wheel(feed);
  fireEvent.scroll(feed);
}

describe("MessageList boundary pagination guards", () => {
  const scrollIntoView = vi.fn();
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
    scrollIntoView.mockReset();
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

  it("does not call onLoadMore after first-unread scrollIntoView without user scroll", async () => {
    const onLoadMore = vi.fn();
    const messages = [
      msg(1, { sender_id: 99, flags: ["read"] }),
      msg(2, { sender_id: 99, flags: ["read"] }),
      msg(3, { sender_id: 43, flags: [] }),
      ...Array.from({ length: 20 }, (_, index) => msg(4 + index, { sender_id: 43, flags: [] })),
    ];

    render(
      <MessageList
        messages={messages}
        currentUserId={7}
        firstUnreadId={3}
        unreadCount={21}
        scrollToBottomKey="chat-a"
        onLoadMore={onLoadMore}
      />,
    );

    const feed = document.querySelector('[role="feed"]') as HTMLDivElement;
    Object.defineProperty(feed, "scrollHeight", { configurable: true, value: 4000 });
    Object.defineProperty(feed, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(feed, "scrollTop", { configurable: true, writable: true, value: 40 });

    await act(async () => {
      await flushProgrammaticScrollFrames();
    });

    expect(scrollIntoView).toHaveBeenCalled();

    fireEvent.scroll(feed);
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it("calls onLoadMore only after user scroll near top", async () => {
    const onLoadMore = vi.fn();
    const messages = [msg(1), msg(2), msg(3)];

    render(
      <MessageList
        messages={messages}
        scrollToBottomKey="chat-b"
        onLoadMore={onLoadMore}
        isLoadingMore={false}
      />,
    );

    const feed = document.querySelector('[role="feed"]') as HTMLDivElement;
    Object.defineProperty(feed, "scrollHeight", { configurable: true, value: 1000 });
    Object.defineProperty(feed, "clientHeight", { configurable: true, value: 400 });

    await act(async () => {
      await flushProgrammaticScrollFrames();
    });

    Object.defineProperty(feed, "scrollTop", { configurable: true, writable: true, value: 50 });
    fireEvent.scroll(feed);
    expect(onLoadMore).not.toHaveBeenCalled();

    act(() => {
      dispatchUserScroll(feed);
    });
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("calls onLoadMore once for repeated scroll events at top until re-armed", async () => {
    const onLoadMore = vi.fn();
    const messages = [msg(1), msg(2), msg(3)];

    render(
      <MessageList
        messages={messages}
        scrollToBottomKey="chat-b-repeat"
        onLoadMore={onLoadMore}
        isLoadingMore={false}
      />,
    );

    const feed = document.querySelector('[role="feed"]') as HTMLDivElement;
    Object.defineProperty(feed, "scrollHeight", { configurable: true, value: 1000 });
    Object.defineProperty(feed, "clientHeight", { configurable: true, value: 400 });

    await act(async () => {
      await flushProgrammaticScrollFrames();
    });

    Object.defineProperty(feed, "scrollTop", { configurable: true, writable: true, value: 50 });

    act(() => {
      dispatchUserScroll(feed);
    });
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    act(() => {
      fireEvent.scroll(feed);
      fireEvent.scroll(feed);
      fireEvent.scroll(feed);
    });
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    feed.scrollTop = 200;
    act(() => {
      fireEvent.scroll(feed);
    });

    feed.scrollTop = 40;
    act(() => {
      dispatchUserScroll(feed);
    });
    expect(onLoadMore).toHaveBeenCalledTimes(2);
  });

  it("re-arms load older after older messages prepend", async () => {
    const onLoadMore = vi.fn();
    const initial = [msg(1), msg(2), msg(3)];

    const { rerender } = render(
      <MessageList
        messages={initial}
        scrollToBottomKey="chat-b-prepend"
        onLoadMore={onLoadMore}
        isLoadingMore={false}
      />,
    );

    const feed = document.querySelector('[role="feed"]') as HTMLDivElement;
    Object.defineProperty(feed, "scrollHeight", { configurable: true, value: 1000 });
    Object.defineProperty(feed, "clientHeight", { configurable: true, value: 400 });

    await act(async () => {
      await flushProgrammaticScrollFrames();
    });

    Object.defineProperty(feed, "scrollTop", { configurable: true, writable: true, value: 50 });

    act(() => {
      dispatchUserScroll(feed);
    });
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    act(() => {
      rerender(
        <MessageList
          messages={[msg(0), ...initial]}
          scrollToBottomKey="chat-b-prepend"
          onLoadMore={onLoadMore}
          isLoadingMore={false}
        />,
      );
    });

    await act(async () => {
      await flushProgrammaticScrollFrames();
    });

    act(() => {
      dispatchUserScroll(feed);
    });
    expect(onLoadMore).toHaveBeenCalledTimes(2);
  });

  it("does not call onLoadNewer on mount when hasNewerMessages and list fits viewport", async () => {
    const onLoadNewer = vi.fn();
    const messages = [
      msg(1, { sender_id: 43, flags: [] }),
      msg(2, { sender_id: 43, flags: [] }),
      msg(3, { sender_id: 43, flags: [] }),
    ];

    render(
      <MessageList
        messages={messages}
        currentUserId={7}
        hasNewerMessages
        scrollToBottomKey="chat-c"
        onLoadNewer={onLoadNewer}
      />,
    );

    const feed = document.querySelector('[role="feed"]') as HTMLDivElement;
    Object.defineProperty(feed, "scrollHeight", { configurable: true, value: 300 });
    Object.defineProperty(feed, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(feed, "scrollTop", { configurable: true, writable: true, value: 0 });

    await act(async () => {
      await flushProgrammaticScrollFrames();
    });

    fireEvent.scroll(feed);
    expect(onLoadNewer).not.toHaveBeenCalled();
  });

  it("calls onLoadNewer after user scroll to bottom when last unread is at tail", async () => {
    const onLoadNewer = vi.fn();
    const messages = [
      msg(1, { sender_id: 99, flags: ["read"] }),
      msg(2, { sender_id: 43, flags: [] }),
      msg(3, { sender_id: 43, flags: [] }),
    ];

    render(
      <MessageList
        messages={messages}
        currentUserId={7}
        hasNewerMessages
        scrollToBottomKey="chat-d"
        onLoadNewer={onLoadNewer}
      />,
    );

    const feed = document.querySelector('[role="feed"]') as HTMLDivElement;
    Object.defineProperty(feed, "scrollHeight", { configurable: true, value: 1200 });
    Object.defineProperty(feed, "clientHeight", { configurable: true, value: 400 });

    await act(async () => {
      await flushProgrammaticScrollFrames();
    });

    const message3 = screen.getByTestId("message-3");
    message3.getBoundingClientRect = () => ({
      top: 300,
      bottom: 380,
      left: 0,
      right: 0,
      width: 0,
      height: 80,
      x: 0,
      y: 300,
      toJSON: () => ({}),
    });
    feed.getBoundingClientRect = () => ({
      top: 0,
      bottom: 400,
      left: 0,
      right: 0,
      width: 0,
      height: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    Object.defineProperty(feed, "scrollTop", { configurable: true, writable: true, value: 820 });

    act(() => {
      dispatchUserScroll(feed);
    });

    expect(onLoadNewer).toHaveBeenCalledTimes(1);
  });
});
