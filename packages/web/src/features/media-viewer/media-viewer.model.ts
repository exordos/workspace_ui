/**
 * Media Viewer store — manages full-screen image/video viewer state.
 *
 * Supports opening a gallery of media items, navigating between them,
 * and closing the viewer. All index operations are clamped to valid bounds.
 */

import { create } from "zustand";
import { createLogger, logStoreAction } from "~/shared/lib/logger";
import type { MediaItem, MediaViewerState } from "./media-viewer.types";

const log = createLogger("media-viewer");

const EMPTY_ITEMS: MediaItem[] = [];

function releaseWorkspaceObjectUrls(items: readonly MediaItem[]): void {
  const objectUrls = new Set<string>();
  for (const item of items) {
    const objectUrl = item.workspaceFile?.objectUrl;
    if (objectUrl?.startsWith("blob:") === true) {
      objectUrls.add(objectUrl);
    }
  }

  for (const objectUrl of objectUrls) {
    URL.revokeObjectURL(objectUrl);
  }
}

function releaseReplacedWorkspaceObjectUrl(
  previousItem: MediaItem,
  nextItems: readonly MediaItem[],
): void {
  const objectUrl = previousItem.workspaceFile?.objectUrl;
  if (objectUrl?.startsWith("blob:") !== true) return;
  if (nextItems.some((item) => item.workspaceFile?.objectUrl === objectUrl)) return;

  URL.revokeObjectURL(objectUrl);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export const useMediaViewerStore = create<MediaViewerState>((set, get) => ({
  isOpen: false,
  currentIndex: 0,
  items: EMPTY_ITEMS,

  open(items, startIndex = 0) {
    if (items.length === 0) {
      log.warn("Attempted to open media viewer with empty items");
      return;
    }
    const clamped = clamp(startIndex, 0, items.length - 1);
    logStoreAction("media-viewer", "open", { count: items.length, startIndex: clamped });
    releaseWorkspaceObjectUrls(get().items);
    set({ isOpen: true, items, currentIndex: clamped });
  },

  replaceItem(index, item) {
    const { isOpen, items, currentIndex } = get();
    if (!isOpen || index < 0 || index >= items.length) return;

    const previousItem = items[index];
    if (previousItem == null) return;
    if (previousItem === item) return;

    const nextItems = items.slice();
    nextItems[index] = item;
    releaseReplacedWorkspaceObjectUrl(previousItem, nextItems);
    logStoreAction("media-viewer", "replaceItem", { index, currentIndex });
    set({ items: nextItems });
  },

  close() {
    logStoreAction("media-viewer", "close", {});
    releaseWorkspaceObjectUrls(get().items);
    set({ isOpen: false, items: EMPTY_ITEMS, currentIndex: 0 });
  },

  next() {
    const { currentIndex, items } = get();
    if (currentIndex < items.length - 1) {
      const nextIdx = currentIndex + 1;
      logStoreAction("media-viewer", "next", { index: nextIdx });
      set({ currentIndex: nextIdx });
    }
  },

  prev() {
    const { currentIndex } = get();
    if (currentIndex > 0) {
      const prevIdx = currentIndex - 1;
      logStoreAction("media-viewer", "prev", { index: prevIdx });
      set({ currentIndex: prevIdx });
    }
  },

  goTo(index) {
    const { items } = get();
    if (items.length === 0) return;
    const clamped = clamp(index, 0, items.length - 1);
    logStoreAction("media-viewer", "goTo", { index: clamped });
    set({ currentIndex: clamped });
  },

  currentItem() {
    const { items, currentIndex, isOpen } = get();
    if (!isOpen || items.length === 0) return undefined;
    return items[currentIndex];
  },
}));
