import { renderHook, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useIntersectedOnce } from "./intersected-once.hook";

describe("useIntersectedOnce", () => {
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
    observe = vi.fn();
    takeRecords = vi.fn(() => []);
    unobserve = vi.fn();

    constructor(
      callback: (entries: IntersectionObserverEntry[], observer: IntersectionObserver) => void,
    ) {
      ioCallback = callback;
    }
  }

  beforeEach(() => {
    ioCallback = null;
    globalThis.IntersectionObserver = IoMock;
  });

  afterEach(() => {
    globalThis.IntersectionObserver = originalIo;
  });

  it("stays false until intersection is reported", async () => {
    const feed = document.createElement("div");
    feed.setAttribute("role", "feed");
    const target = document.createElement("div");
    feed.appendChild(target);
    document.body.appendChild(feed);

    const { result } = renderHook(() => {
      const ref = useRef<HTMLDivElement>(target);
      return useIntersectedOnce(ref);
    });

    expect(result.current).toBe(false);

    ioCallback?.(
      [{ target, isIntersecting: true }] as unknown as IntersectionObserverEntry[],
      {} as IntersectionObserver,
    );

    await waitFor(() => {
      expect(result.current).toBe(true);
    });

    feed.remove();
  });

  it("defaults to true when IntersectionObserver is missing", () => {
    globalThis.IntersectionObserver = undefined as unknown as typeof IntersectionObserver;
    const target = document.createElement("div");

    const { result } = renderHook(() => {
      const ref = useRef<HTMLDivElement>(target);
      return useIntersectedOnce(ref);
    });

    expect(result.current).toBe(true);
  });
});
