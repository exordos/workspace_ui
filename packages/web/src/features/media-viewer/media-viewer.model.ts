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
    set({ isOpen: true, items, currentIndex: clamped });
  },

  close() {
    logStoreAction("media-viewer", "close", {});
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
