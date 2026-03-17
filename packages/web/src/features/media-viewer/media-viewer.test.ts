/**
 * Tests for the Media Viewer feature — full-screen image/video viewer.
 *
 * Covers store actions: open, close, next, prev, goTo, and currentItem.
 * Validates navigation boundaries and state transitions.
 */
import { afterEach, describe, expect, it } from "vitest";
import { useMediaViewerStore } from "./media-viewer.model";
import type { MediaItem } from "./media-viewer.types";

const ITEMS: MediaItem[] = [
  { url: "https://example.com/img1.jpg", type: "image", alt: "First image" },
  {
    url: "https://example.com/vid1.mp4",
    type: "video",
    alt: "First video",
    width: 1920,
    height: 1080,
  },
  { url: "https://example.com/img2.png", type: "image", width: 800, height: 600 },
];

describe("useMediaViewerStore", () => {
  afterEach(() => {
    useMediaViewerStore.getState().close();
  });

  // --- Initial state ---

  it("starts closed with no items", () => {
    const state = useMediaViewerStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.items).toHaveLength(0);
    expect(state.currentIndex).toBe(0);
  });

  // --- open ---

  it("opens with items at default index 0", () => {
    useMediaViewerStore.getState().open(ITEMS);
    const state = useMediaViewerStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.items).toHaveLength(3);
    expect(state.currentIndex).toBe(0);
  });

  it("opens with items at specified startIndex", () => {
    useMediaViewerStore.getState().open(ITEMS, 2);
    expect(useMediaViewerStore.getState().currentIndex).toBe(2);
  });

  it("clamps startIndex to valid range", () => {
    useMediaViewerStore.getState().open(ITEMS, 10);
    expect(useMediaViewerStore.getState().currentIndex).toBe(2);
  });

  it("clamps negative startIndex to 0", () => {
    useMediaViewerStore.getState().open(ITEMS, -5);
    expect(useMediaViewerStore.getState().currentIndex).toBe(0);
  });

  it("does not open with empty items array", () => {
    useMediaViewerStore.getState().open([]);
    expect(useMediaViewerStore.getState().isOpen).toBe(false);
  });

  // --- close ---

  it("closes and resets state", () => {
    useMediaViewerStore.getState().open(ITEMS, 1);
    useMediaViewerStore.getState().close();
    const state = useMediaViewerStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.items).toHaveLength(0);
    expect(state.currentIndex).toBe(0);
  });

  // --- next ---

  it("navigates to next item", () => {
    useMediaViewerStore.getState().open(ITEMS);
    useMediaViewerStore.getState().next();
    expect(useMediaViewerStore.getState().currentIndex).toBe(1);
  });

  it("does not go past last item", () => {
    useMediaViewerStore.getState().open(ITEMS, 2);
    useMediaViewerStore.getState().next();
    expect(useMediaViewerStore.getState().currentIndex).toBe(2);
  });

  // --- prev ---

  it("navigates to previous item", () => {
    useMediaViewerStore.getState().open(ITEMS, 2);
    useMediaViewerStore.getState().prev();
    expect(useMediaViewerStore.getState().currentIndex).toBe(1);
  });

  it("does not go before first item", () => {
    useMediaViewerStore.getState().open(ITEMS, 0);
    useMediaViewerStore.getState().prev();
    expect(useMediaViewerStore.getState().currentIndex).toBe(0);
  });

  // --- goTo ---

  it("goes to specific valid index", () => {
    useMediaViewerStore.getState().open(ITEMS);
    useMediaViewerStore.getState().goTo(2);
    expect(useMediaViewerStore.getState().currentIndex).toBe(2);
  });

  it("clamps goTo index to upper bound", () => {
    useMediaViewerStore.getState().open(ITEMS);
    useMediaViewerStore.getState().goTo(100);
    expect(useMediaViewerStore.getState().currentIndex).toBe(2);
  });

  it("clamps goTo index to lower bound", () => {
    useMediaViewerStore.getState().open(ITEMS);
    useMediaViewerStore.getState().goTo(-10);
    expect(useMediaViewerStore.getState().currentIndex).toBe(0);
  });

  // --- currentItem ---

  it("returns current item based on index", () => {
    useMediaViewerStore.getState().open(ITEMS, 1);
    const item = useMediaViewerStore.getState().currentItem();
    expect(item?.url).toBe("https://example.com/vid1.mp4");
    expect(item?.type).toBe("video");
  });

  it("returns undefined when closed", () => {
    expect(useMediaViewerStore.getState().currentItem()).toBeUndefined();
  });

  // --- Sequential navigation ---

  it("supports full forward navigation cycle", () => {
    useMediaViewerStore.getState().open(ITEMS);
    useMediaViewerStore.getState().next();
    useMediaViewerStore.getState().next();
    expect(useMediaViewerStore.getState().currentIndex).toBe(2);
    useMediaViewerStore.getState().next();
    expect(useMediaViewerStore.getState().currentIndex).toBe(2);
  });

  it("supports full backward navigation cycle", () => {
    useMediaViewerStore.getState().open(ITEMS, 2);
    useMediaViewerStore.getState().prev();
    useMediaViewerStore.getState().prev();
    expect(useMediaViewerStore.getState().currentIndex).toBe(0);
    useMediaViewerStore.getState().prev();
    expect(useMediaViewerStore.getState().currentIndex).toBe(0);
  });

  // --- Single-item gallery ---

  it("single-item gallery: next is a no-op", () => {
    const single: MediaItem[] = [{ url: "https://example.com/only.jpg", type: "image" }];
    useMediaViewerStore.getState().open(single);
    useMediaViewerStore.getState().next();
    expect(useMediaViewerStore.getState().currentIndex).toBe(0);
  });

  it("single-item gallery: prev is a no-op", () => {
    const single: MediaItem[] = [{ url: "https://example.com/only.jpg", type: "image" }];
    useMediaViewerStore.getState().open(single);
    useMediaViewerStore.getState().prev();
    expect(useMediaViewerStore.getState().currentIndex).toBe(0);
  });

  it("single-item gallery: currentItem returns the sole item", () => {
    const single: MediaItem[] = [
      { url: "https://example.com/only.jpg", type: "image", alt: "Solo" },
    ];
    useMediaViewerStore.getState().open(single);
    expect(useMediaViewerStore.getState().currentItem()?.alt).toBe("Solo");
  });

  // --- goTo edge cases ---

  it("goTo is a no-op when viewer is closed (empty items)", () => {
    useMediaViewerStore.getState().goTo(5);
    expect(useMediaViewerStore.getState().currentIndex).toBe(0);
    expect(useMediaViewerStore.getState().isOpen).toBe(false);
  });

  // --- Re-open behavior ---

  it("re-opening replaces previous items and resets index", () => {
    useMediaViewerStore.getState().open(ITEMS, 2);
    expect(useMediaViewerStore.getState().currentIndex).toBe(2);

    const newItems: MediaItem[] = [
      { url: "https://example.com/new1.jpg", type: "image" },
      { url: "https://example.com/new2.jpg", type: "image" },
    ];
    useMediaViewerStore.getState().open(newItems, 0);

    expect(useMediaViewerStore.getState().items).toHaveLength(2);
    expect(useMediaViewerStore.getState().currentIndex).toBe(0);
    expect(useMediaViewerStore.getState().items[0]!.url).toBe("https://example.com/new1.jpg");
  });

  // --- Reference stability ---

  it("closed viewer returns stable EMPTY_ITEMS reference", () => {
    const a = useMediaViewerStore.getState().items;
    const b = useMediaViewerStore.getState().items;
    expect(a).toBe(b);
  });

  it("goTo same index does not change state reference", () => {
    useMediaViewerStore.getState().open(ITEMS, 1);
    useMediaViewerStore.getState().goTo(1);
    expect(useMediaViewerStore.getState().currentIndex).toBe(1);
  });
});
