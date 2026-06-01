import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockMessage } from "~/shared/api/zulip.types";
import { MessageList } from "./message-list.ui";

vi.mock("~/shared/lib/scroll-position.lib", async (importOriginal) => {
  const mod = await importOriginal<typeof import("~/shared/lib/scroll-position.lib")>();
  return { ...mod, scrollToBottom: vi.fn() };
});

const messageRects = new Map<number, Partial<DOMRectReadOnly>>();
const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

beforeEach(() => {
  messageRects.clear();
  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRectMock() {
    const messageId = this.getAttribute("data-message-id");
    if (messageId != null) {
      const rect = messageRects.get(Number(messageId));
      if (rect != null) {
        return buildRect(rect);
      }
    }
    return originalGetBoundingClientRect.call(this);
  };
});

afterEach(() => {
  HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
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

function buildRect(rect: Partial<DOMRectReadOnly>): DOMRect {
  return {
    x: rect.x ?? 0,
    y: rect.y ?? rect.top ?? 0,
    width: rect.width ?? 0,
    height: rect.height ?? 0,
    top: rect.top ?? 0,
    right: rect.right ?? 0,
    bottom: rect.bottom ?? 0,
    left: rect.left ?? 0,
    toJSON: () => ({}),
  } satisfies DOMRect;
}

function setRect(el: HTMLElement, rect: Partial<DOMRectReadOnly>): void {
  el.getBoundingClientRect = () => buildRect(rect);
}

function setMessageRect(messageId: number, rect: Partial<DOMRectReadOnly>): void {
  messageRects.set(messageId, rect);
}

describe("MessageList prepend scroll anchor", () => {
  it("restores scrollTop after older messages finish loading", async () => {
    const onLoadMore = vi.fn();
    const initial = [msg(1), msg(2), msg(3)];

    const { rerender } = render(
      <MessageList
        messages={initial}
        scrollToBottomKey="prepend-test"
        onLoadMore={onLoadMore}
        isLoadingMore={false}
      />,
    );

    const feed = document.querySelector('[role="feed"]') as HTMLDivElement;
    Object.defineProperty(feed, "scrollHeight", { configurable: true, value: 1000 });
    Object.defineProperty(feed, "clientHeight", { configurable: true, value: 400 });

    await act(async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      });
    });

    Object.defineProperty(feed, "scrollTop", { configurable: true, writable: true, value: 50 });
    fireEvent.wheel(feed);
    fireEvent.scroll(feed);

    expect(onLoadMore).toHaveBeenCalledTimes(1);

    act(() => {
      rerender(
        <MessageList
          messages={initial}
          scrollToBottomKey="prepend-test"
          onLoadMore={onLoadMore}
          isLoadingMore={true}
        />,
      );
    });

    act(() => {
      Object.defineProperty(feed, "scrollHeight", { configurable: true, value: 1300 });
      rerender(
        <MessageList
          messages={[msg(0), ...initial]}
          scrollToBottomKey="prepend-test"
          onLoadMore={onLoadMore}
          isLoadingMore={false}
        />,
      );
    });

    expect(feed.scrollTop).toBe(350);
  });

  it("restores scrollTop as soon as prepended messages render while loading continues", async () => {
    const onLoadMore = vi.fn();
    const initial = [msg(1), msg(2), msg(3)];

    const { rerender } = render(
      <MessageList
        messages={initial}
        scrollToBottomKey="prepend-loading-test"
        onLoadMore={onLoadMore}
        isLoadingMore={false}
      />,
    );

    const feed = document.querySelector('[role="feed"]') as HTMLDivElement;
    Object.defineProperty(feed, "scrollHeight", { configurable: true, value: 1000 });
    Object.defineProperty(feed, "clientHeight", { configurable: true, value: 400 });

    await act(async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      });
    });

    Object.defineProperty(feed, "scrollTop", { configurable: true, writable: true, value: 50 });
    fireEvent.wheel(feed);
    fireEvent.scroll(feed);

    expect(onLoadMore).toHaveBeenCalledTimes(1);

    act(() => {
      rerender(
        <MessageList
          messages={initial}
          scrollToBottomKey="prepend-loading-test"
          onLoadMore={onLoadMore}
          isLoadingMore={true}
        />,
      );
    });

    act(() => {
      Object.defineProperty(feed, "scrollHeight", { configurable: true, value: 1300 });
      rerender(
        <MessageList
          messages={[msg(0), ...initial]}
          scrollToBottomKey="prepend-loading-test"
          onLoadMore={onLoadMore}
          isLoadingMore={true}
        />,
      );
    });

    expect(feed.scrollTop).toBe(350);
  });

  it("keeps the visible message anchored by its viewport offset after prepend", async () => {
    const onLoadMore = vi.fn();
    const initial = [msg(1), msg(2), msg(3)];

    const { rerender } = render(
      <MessageList
        messages={initial}
        scrollToBottomKey="prepend-anchor-test"
        onLoadMore={onLoadMore}
        isLoadingMore={false}
      />,
    );

    const feed = document.querySelector('[role="feed"]') as HTMLDivElement;
    Object.defineProperty(feed, "scrollHeight", { configurable: true, value: 1000 });
    Object.defineProperty(feed, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(feed, "scrollTop", { configurable: true, writable: true, value: 50 });
    setRect(feed, { top: 100, bottom: 500 });
    setMessageRect(1, { top: 20, bottom: 80 });
    setMessageRect(2, { top: 120, bottom: 180 });
    setMessageRect(3, { top: 220, bottom: 280 });

    await act(async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      });
    });

    fireEvent.wheel(feed);
    fireEvent.scroll(feed);

    expect(onLoadMore).toHaveBeenCalledTimes(1);

    act(() => {
      rerender(
        <MessageList
          messages={initial}
          scrollToBottomKey="prepend-anchor-test"
          onLoadMore={onLoadMore}
          isLoadingMore={true}
        />,
      );
    });

    setMessageRect(2, { top: 300, bottom: 360 });
    act(() => {
      Object.defineProperty(feed, "scrollHeight", { configurable: true, value: 1300 });
      rerender(
        <MessageList
          messages={[msg(0), ...initial]}
          scrollToBottomKey="prepend-anchor-test"
          onLoadMore={onLoadMore}
          isLoadingMore={true}
        />,
      );
    });

    expect(feed.scrollTop).toBe(230);
  });

  it("updates the pending anchor when the user scrolls while older messages are loading", async () => {
    const onLoadMore = vi.fn();
    const initial = [msg(1), msg(2), msg(3), msg(4)];

    const { rerender } = render(
      <MessageList
        messages={initial}
        scrollToBottomKey="prepend-anchor-update-test"
        onLoadMore={onLoadMore}
        isLoadingMore={false}
      />,
    );

    const feed = document.querySelector('[role="feed"]') as HTMLDivElement;
    Object.defineProperty(feed, "scrollHeight", { configurable: true, value: 1000 });
    Object.defineProperty(feed, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(feed, "scrollTop", { configurable: true, writable: true, value: 50 });
    setRect(feed, { top: 100, bottom: 500 });
    setMessageRect(1, { top: 120, bottom: 180 });
    setMessageRect(2, { top: 220, bottom: 280 });

    await act(async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      });
    });

    fireEvent.wheel(feed);
    fireEvent.scroll(feed);

    expect(onLoadMore).toHaveBeenCalledTimes(1);

    act(() => {
      rerender(
        <MessageList
          messages={initial}
          scrollToBottomKey="prepend-anchor-update-test"
          onLoadMore={onLoadMore}
          isLoadingMore={true}
        />,
      );
    });

    feed.scrollTop = 500;
    setMessageRect(1, { top: -220, bottom: -160 });
    setMessageRect(2, { top: 40, bottom: 100 });
    setMessageRect(3, { top: 220, bottom: 280 });
    fireEvent.wheel(feed);
    fireEvent.scroll(feed);

    setMessageRect(3, { top: 520, bottom: 580 });
    act(() => {
      Object.defineProperty(feed, "scrollHeight", { configurable: true, value: 1300 });
      rerender(
        <MessageList
          messages={[msg(0), ...initial]}
          scrollToBottomKey="prepend-anchor-update-test"
          onLoadMore={onLoadMore}
          isLoadingMore={true}
        />,
      );
    });

    expect(feed.scrollTop).toBe(800);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("does not consume the pending prepend snapshot when only the tail grows", async () => {
    const onLoadMore = vi.fn();
    const initial = [msg(1), msg(2), msg(3)];

    const { rerender } = render(
      <MessageList
        messages={initial}
        scrollToBottomKey="prepend-tail-growth-test"
        onLoadMore={onLoadMore}
        isLoadingMore={false}
      />,
    );

    const feed = document.querySelector('[role="feed"]') as HTMLDivElement;
    Object.defineProperty(feed, "scrollHeight", { configurable: true, value: 1000 });
    Object.defineProperty(feed, "clientHeight", { configurable: true, value: 400 });

    await act(async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      });
    });

    Object.defineProperty(feed, "scrollTop", { configurable: true, writable: true, value: 50 });
    fireEvent.wheel(feed);
    fireEvent.scroll(feed);

    expect(onLoadMore).toHaveBeenCalledTimes(1);

    act(() => {
      Object.defineProperty(feed, "scrollHeight", { configurable: true, value: 1100 });
      rerender(
        <MessageList
          messages={[...initial, msg(4)]}
          scrollToBottomKey="prepend-tail-growth-test"
          onLoadMore={onLoadMore}
          isLoadingMore={true}
        />,
      );
    });

    expect(feed.scrollTop).toBe(50);

    act(() => {
      Object.defineProperty(feed, "scrollHeight", { configurable: true, value: 1400 });
      rerender(
        <MessageList
          messages={[msg(0), ...initial, msg(4)]}
          scrollToBottomKey="prepend-tail-growth-test"
          onLoadMore={onLoadMore}
          isLoadingMore={true}
        />,
      );
    });

    expect(feed.scrollTop).toBe(450);
  });
});
