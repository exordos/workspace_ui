import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMarkAsReadBatcher } from "./chat-mark-as-read.lib";

describe("createMarkAsReadBatcher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
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
});
