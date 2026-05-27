import { act, fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MockMessage } from "~/shared/api/zulip.types";
import { MessageList } from "./message-list.ui";

vi.mock("~/shared/lib/scroll-position.lib", async (importOriginal) => {
  const mod = await importOriginal<typeof import("~/shared/lib/scroll-position.lib")>();
  return { ...mod, scrollToBottom: vi.fn() };
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
});
