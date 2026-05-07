import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMarkAsReadBatcher } from "./chat-mark-as-read.lib";

const isTabVisible = vi.fn(() => true);
const visibilityListeners = new Set<(visible: boolean) => void>();

vi.mock("~/shared/lib/visibility", () => ({
  isTabVisible: () => isTabVisible(),
  onVisibilityChange: (cb: (visible: boolean) => void) => {
    visibilityListeners.add(cb);
    return () => {
      visibilityListeners.delete(cb);
    };
  },
}));

function emitVisibility(visible: boolean) {
  for (const cb of visibilityListeners) {
    cb(visible);
  }
}

describe("createMarkAsReadBatcher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    isTabVisible.mockReturnValue(true);
    visibilityListeners.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    visibilityListeners.clear();
    isTabVisible.mockReset();
    isTabVisible.mockReturnValue(true);
  });

  it("debounces and deduplicates scheduled message ids", async () => {
    const markAsRead = vi.fn().mockResolvedValue(true);
    const onMarked = vi.fn();
    const batcher = createMarkAsReadBatcher({ markAsRead, onMarked, debounceMs: 200 });

    batcher.schedule([1, 2]);
    batcher.schedule([2, 3]);

    await vi.advanceTimersByTimeAsync(199);
    expect(markAsRead).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(markAsRead).toHaveBeenCalledTimes(1);
    expect(markAsRead).toHaveBeenCalledWith([1, 2, 3]);
    expect(onMarked).toHaveBeenCalledWith([1, 2, 3]);
  });

  it("flushes immediately when requested", async () => {
    const markAsRead = vi.fn().mockResolvedValue(true);
    const batcher = createMarkAsReadBatcher({ markAsRead, debounceMs: 500 });

    batcher.schedule([10, 11]);
    await batcher.flush();

    expect(markAsRead).toHaveBeenCalledTimes(1);
    expect(markAsRead).toHaveBeenCalledWith([10, 11]);
  });

  it("cancels queued ids without calling markAsRead", async () => {
    const markAsRead = vi.fn().mockResolvedValue(true);
    const batcher = createMarkAsReadBatcher({ markAsRead, debounceMs: 100 });

    batcher.schedule([7, 8]);
    batcher.cancel();

    await vi.advanceTimersByTimeAsync(120);
    expect(markAsRead).not.toHaveBeenCalled();
  });

  it("simulates route switch: cancelled batcher never flushes; new batcher only sends its ids", async () => {
    const markAsReadOld = vi.fn().mockResolvedValue(true);
    const batcherOld = createMarkAsReadBatcher({ markAsRead: markAsReadOld, debounceMs: 100 });
    batcherOld.schedule([100, 101]);
    batcherOld.cancel();
    await vi.advanceTimersByTimeAsync(120);
    expect(markAsReadOld).not.toHaveBeenCalled();

    const markAsReadNew = vi.fn().mockResolvedValue(true);
    const batcherNew = createMarkAsReadBatcher({ markAsRead: markAsReadNew, debounceMs: 100 });
    batcherNew.schedule([202]);
    await vi.advanceTimersByTimeAsync(100);
    expect(markAsReadNew).toHaveBeenCalledTimes(1);
    expect(markAsReadNew).toHaveBeenCalledWith([202]);
    expect(markAsReadOld).not.toHaveBeenCalled();
  });

  it("defers flush while tab hidden then sends after visible", async () => {
    vi.useRealTimers();
    isTabVisible.mockReturnValue(false);
    const markAsRead = vi.fn().mockResolvedValue(true);
    const batcher = createMarkAsReadBatcher({
      markAsRead,
      debounceMs: 100,
      respectTabVisibility: true,
    });

    batcher.schedule([5, 6]);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 110);
    });
    expect(markAsRead).not.toHaveBeenCalled();

    isTabVisible.mockReturnValue(true);
    emitVisibility(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(markAsRead).toHaveBeenCalledTimes(1);
    expect(markAsRead).toHaveBeenCalledWith([5, 6]);
    vi.useFakeTimers();
  });

  it("flushes while hidden when respectTabVisibility is false", async () => {
    isTabVisible.mockReturnValue(false);
    const markAsRead = vi.fn().mockResolvedValue(true);
    const batcher = createMarkAsReadBatcher({
      markAsRead,
      debounceMs: 50,
      respectTabVisibility: false,
    });

    batcher.schedule([9]);
    await vi.advanceTimersByTimeAsync(50);
    expect(markAsRead).toHaveBeenCalledWith([9]);
  });
});
