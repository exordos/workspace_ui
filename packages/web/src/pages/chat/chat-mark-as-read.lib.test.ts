import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testMessageId } from "~/test/factories";
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

  it("calls onSchedule when ids are newly queued", async () => {
    const markAsRead = vi.fn().mockResolvedValue(true);
    const onSchedule = vi.fn();
    const batcher = createMarkAsReadBatcher({ markAsRead, onSchedule, debounceMs: 200 });

    batcher.schedule([testMessageId(1), testMessageId(2)]);
    batcher.schedule([testMessageId(2)]);

    expect(onSchedule).toHaveBeenCalledTimes(1);
    expect(onSchedule).toHaveBeenCalledWith([testMessageId(1), testMessageId(2)]);

    await vi.advanceTimersByTimeAsync(200);
    expect(markAsRead).toHaveBeenCalledWith([testMessageId(1), testMessageId(2)]);
  });

  it("debounces and deduplicates scheduled message ids", async () => {
    const markAsRead = vi.fn().mockResolvedValue(true);
    const onMarked = vi.fn();
    const batcher = createMarkAsReadBatcher({ markAsRead, onMarked, debounceMs: 200 });

    batcher.schedule([testMessageId(1), testMessageId(2)]);
    batcher.schedule([testMessageId(2), testMessageId(3)]);

    await vi.advanceTimersByTimeAsync(199);
    expect(markAsRead).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(markAsRead).toHaveBeenCalledTimes(1);
    expect(markAsRead).toHaveBeenCalledWith([testMessageId(1), testMessageId(2), testMessageId(3)]);
    expect(onMarked).toHaveBeenCalledWith([testMessageId(1), testMessageId(2), testMessageId(3)]);
  });

  it("flushes immediately when requested", async () => {
    const markAsRead = vi.fn().mockResolvedValue(true);
    const batcher = createMarkAsReadBatcher({ markAsRead, debounceMs: 500 });

    batcher.schedule([testMessageId(10), testMessageId(11)]);
    await batcher.flush();

    expect(markAsRead).toHaveBeenCalledTimes(1);
    expect(markAsRead).toHaveBeenCalledWith([testMessageId(10), testMessageId(11)]);
  });

  it("cancels queued ids without calling markAsRead", async () => {
    const markAsRead = vi.fn().mockResolvedValue(true);
    const batcher = createMarkAsReadBatcher({ markAsRead, debounceMs: 100 });

    batcher.schedule([testMessageId(7), testMessageId(8)]);
    batcher.cancel();

    await vi.advanceTimersByTimeAsync(120);
    expect(markAsRead).not.toHaveBeenCalled();
  });

  it("simulates route switch: cancelled batcher never flushes; new batcher only sends its ids", async () => {
    const markAsReadOld = vi.fn().mockResolvedValue(true);
    const batcherOld = createMarkAsReadBatcher({ markAsRead: markAsReadOld, debounceMs: 100 });
    batcherOld.schedule([testMessageId(100), testMessageId(101)]);
    batcherOld.cancel();
    await vi.advanceTimersByTimeAsync(120);
    expect(markAsReadOld).not.toHaveBeenCalled();

    const markAsReadNew = vi.fn().mockResolvedValue(true);
    const batcherNew = createMarkAsReadBatcher({ markAsRead: markAsReadNew, debounceMs: 100 });
    batcherNew.schedule([testMessageId(202)]);
    await vi.advanceTimersByTimeAsync(100);
    expect(markAsReadNew).toHaveBeenCalledTimes(1);
    expect(markAsReadNew).toHaveBeenCalledWith([testMessageId(202)]);
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

    batcher.schedule([testMessageId(5), testMessageId(6)]);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 110);
    });
    expect(markAsRead).not.toHaveBeenCalled();

    isTabVisible.mockReturnValue(true);
    emitVisibility(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(markAsRead).toHaveBeenCalledTimes(1);
    expect(markAsRead).toHaveBeenCalledWith([testMessageId(5), testMessageId(6)]);
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

    batcher.schedule([testMessageId(9)]);
    await vi.advanceTimersByTimeAsync(50);
    expect(markAsRead).toHaveBeenCalledWith([testMessageId(9)]);
  });
});
