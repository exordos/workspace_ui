import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLinkPreviewStore } from "~/entities/link-preview/link-preview.model";
import type { MockMessage } from "~/shared/api/zulip.types";
import { useMessageLinkPreview } from "./message-link-preview.hook";
import type { RefObject } from "react";

function baseMessage(overrides: Partial<MockMessage> = {}): MockMessage {
  return {
    id: 42,
    sender_id: 1,
    sender_full_name: "Alice",
    stream_id: 5,
    subject: "general",
    content: "https://example.com",
    timestamp: 1,
    ...overrides,
  };
}

describe("useMessageLinkPreview", () => {
  const originalIo = globalThis.IntersectionObserver;
  let ioCallback:
    | ((entries: IntersectionObserverEntry[], observer: IntersectionObserver) => void)
    | null = null;

  class IoMock implements IntersectionObserver {
    readonly root: Element | Document | null = null;
    readonly rootMargin = "";
    readonly scrollMargin = "";
    readonly thresholds: readonly number[] = [0];
    disconnect = vi.fn();
    observe = vi.fn((target: Element) => {
      ioCallback?.(
        [{ target, isIntersecting: true }] as unknown as IntersectionObserverEntry[],
        {} as IntersectionObserver,
      );
    });
    takeRecords = vi.fn(() => []);
    unobserve = vi.fn();

    constructor(
      callback: (entries: IntersectionObserverEntry[], observer: IntersectionObserver) => void,
    ) {
      ioCallback = callback;
    }
  }

  function createVisibilityRef(): {
    ref: RefObject<HTMLDivElement>;
    teardown: () => void;
  } {
    const feed = document.createElement("div");
    feed.setAttribute("role", "feed");
    const el = document.createElement("div");
    feed.appendChild(el);
    document.body.appendChild(feed);
    return {
      ref: { current: el },
      teardown: () => {
        feed.remove();
      },
    };
  }

  beforeEach(() => {
    ioCallback = null;
    globalThis.IntersectionObserver = IoMock;
    useLinkPreviewStore.getState().clear();
  });

  afterEach(() => {
    cleanup();
    useLinkPreviewStore.getState().clear();
    vi.restoreAllMocks();
    globalThis.IntersectionObserver = originalIo;
    document.body.innerHTML = "";
  });

  it("does not request preview when server already sent link_preview", async () => {
    const requestSpy = vi.spyOn(useLinkPreviewStore.getState(), "requestPreviewForMessage");
    const { ref, teardown } = createVisibilityRef();

    const { result, unmount } = renderHook(() =>
      useMessageLinkPreview(
        baseMessage({
          id: 43,
          link_preview: { targetUrl: "https://example.com", title: "From server" },
        }),
        ref,
      ),
    );

    await waitFor(() => {
      expect(result.current.previews[0]?.status).toBe("ready");
    });
    expect(requestSpy).not.toHaveBeenCalled();
    expect(result.current.previews[0]?.previewData?.title).toBe("From server");
    unmount();
    teardown();
  });

  it("does not request preview until the bubble intersects the feed", async () => {
    const requestSpy = vi.spyOn(useLinkPreviewStore.getState(), "requestPreviewForMessage");
    const feed = document.createElement("div");
    feed.setAttribute("role", "feed");
    const el = document.createElement("div");
    feed.appendChild(el);
    document.body.appendChild(feed);
    const ref = { current: el };

    globalThis.IntersectionObserver = originalIo;
    class IoDeferredMock implements IntersectionObserver {
      readonly root: Element | Document | null = null;
      readonly rootMargin = "";
      readonly scrollMargin = "";
      readonly thresholds: readonly number[] = [0];
      disconnect = vi.fn();
      observe = vi.fn();
      takeRecords = vi.fn(() => []);
      unobserve = vi.fn();
      constructor(
        callback: (entries: IntersectionObserverEntry[], observer: IntersectionObserver) => void,
      ) {
        ioCallback = callback;
      }
    }
    globalThis.IntersectionObserver = IoDeferredMock;

    renderHook(() => useMessageLinkPreview(baseMessage(), ref));

    await waitFor(() => {
      expect(requestSpy).not.toHaveBeenCalled();
    });

    ioCallback?.(
      [{ target: el, isIntersecting: true }] as unknown as IntersectionObserverEntry[],
      {} as IntersectionObserver,
    );

    await waitFor(() => {
      expect(requestSpy).toHaveBeenCalled();
    });

    feed.remove();
  });

  it("requests preview after visibility for loaded messages without server preview", async () => {
    const requestSpy = vi
      .spyOn(useLinkPreviewStore.getState(), "requestPreviewForMessage")
      .mockResolvedValue({
        status: "ready",
        items: [
          {
            targetUrl: "https://example.com",
            data: { targetUrl: "https://example.com", title: "Example" },
          },
        ],
        contentFingerprint: "fp",
        fetchedAt: Date.now(),
      });

    const { ref, teardown } = createVisibilityRef();
    const { unmount } = renderHook(() => useMessageLinkPreview(baseMessage(), ref));

    await waitFor(() => {
      expect(requestSpy).toHaveBeenCalledWith(42, "https://example.com");
    });
    unmount();
    teardown();
    await requestSpy.mock.results[0]?.value;
  });

  it("returns one preview item per URL in message", async () => {
    const { ref, teardown } = createVisibilityRef();
    const { result, unmount } = renderHook(() =>
      useMessageLinkPreview(
        baseMessage({
          content: "https://one.test and https://two.test",
          link_previews: [{ targetUrl: "https://one.test", title: "One" }],
        }),
        ref,
      ),
    );

    await waitFor(() => {
      expect(result.current.previews).toHaveLength(2);
    });
    expect(result.current.previews[0]?.previewUrl).toBe("https://one.test");
    expect(result.current.previews[0]?.previewData?.title).toBe("One");
    expect(result.current.previews[1]?.previewUrl).toBe("https://two.test");
    unmount();
    teardown();
  });
});
