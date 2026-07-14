/**
 * Tests for the Media Viewer feature — full-screen image/video viewer.
 *
 * Covers store actions: open, close, next, prev, goTo, and currentItem.
 * Validates navigation boundaries and state transitions.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
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

  // --- replaceItem ---

  it("replaces an item without changing the current index", () => {
    const placeholder: MediaItem = { url: "blob:placeholder", type: "image" };
    const ready: MediaItem = {
      url: "blob:ready",
      type: "image",
      alt: "Loaded image",
      workspaceFile: { fileUuid: "55555555-5555-4555-8555-555555555555" },
    };
    useMediaViewerStore.getState().open([placeholder, ITEMS[1]!], 1);

    useMediaViewerStore.getState().replaceItem(0, ready);

    const state = useMediaViewerStore.getState();
    expect(state.items[0]).toBe(ready);
    expect(state.currentIndex).toBe(1);
  });

  it("does nothing for an invalid index or a closed viewer", () => {
    const items = [ITEMS[0]!, ITEMS[1]!];
    useMediaViewerStore.getState().open(items, 1);
    const stateBefore = useMediaViewerStore.getState();

    useMediaViewerStore.getState().replaceItem(-1, ITEMS[2]!);
    useMediaViewerStore.getState().replaceItem(items.length, ITEMS[2]!);

    const stateAfter = useMediaViewerStore.getState();
    expect(stateAfter.items).toBe(stateBefore.items);
    expect(stateAfter.currentIndex).toBe(1);

    useMediaViewerStore.getState().close();
    useMediaViewerStore.getState().replaceItem(0, ITEMS[2]!);
    expect(useMediaViewerStore.getState().items).toHaveLength(0);
  });

  it("releases the replaced Workspace object URL when it is no longer used", () => {
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const oldItem: MediaItem = {
      url: "blob:old",
      type: "image",
      workspaceFile: {
        fileUuid: "66666666-6666-4666-8666-666666666666",
        objectUrl: "blob:old",
      },
    };
    const newItem: MediaItem = {
      url: "blob:new",
      type: "image",
      workspaceFile: {
        fileUuid: "77777777-7777-4777-8777-777777777777",
        objectUrl: "blob:new",
      },
    };
    useMediaViewerStore.getState().open([oldItem], 0);

    useMediaViewerStore.getState().replaceItem(0, newItem);

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:old");
    expect(revokeObjectURL).not.toHaveBeenCalledWith("blob:new");

    useMediaViewerStore.getState().close();
    revokeObjectURL.mockRestore();
  });

  it("keeps an old object URL that is still used by another item or the replacement", () => {
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const sharedObjectUrl = "blob:shared";
    const oldItem: MediaItem = {
      url: sharedObjectUrl,
      type: "image",
      workspaceFile: {
        fileUuid: "88888888-8888-4888-8888-888888888888",
        objectUrl: sharedObjectUrl,
      },
    };
    const otherItem: MediaItem = {
      url: "blob:other",
      type: "image",
      workspaceFile: {
        fileUuid: "99999999-9999-4999-8999-999999999999",
        objectUrl: sharedObjectUrl,
      },
    };
    useMediaViewerStore.getState().open([oldItem, otherItem], 0);

    useMediaViewerStore.getState().replaceItem(0, {
      url: sharedObjectUrl,
      type: "image",
      workspaceFile: {
        fileUuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        objectUrl: sharedObjectUrl,
      },
    });

    expect(revokeObjectURL).not.toHaveBeenCalledWith(sharedObjectUrl);

    useMediaViewerStore.getState().close();
    revokeObjectURL.mockRestore();
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

  it("releases Workspace-owned object URLs on close", () => {
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    useMediaViewerStore.getState().open(
      [
        {
          url: "blob:workspace-viewer-image",
          type: "image",
          workspaceFile: {
            fileUuid: "44444444-4444-4444-8444-444444444444",
            objectUrl: "blob:workspace-viewer-image",
          },
        },
        { url: "blob:legacy-preview", type: "image" },
      ],
      0,
    );

    useMediaViewerStore.getState().close();

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:workspace-viewer-image");
    expect(revokeObjectURL).not.toHaveBeenCalledWith("blob:legacy-preview");
    revokeObjectURL.mockRestore();
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
