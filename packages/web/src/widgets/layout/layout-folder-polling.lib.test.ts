import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startFolderPolling } from "./layout-folder-polling.lib";

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("layout-folder-polling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("polls immediately and by interval when runImmediately is true", async () => {
    const refreshFolders = vi.fn().mockResolvedValue(undefined);
    const cleanup = startFolderPolling({
      enabled: true,
      pollIntervalMs: 1000,
      runImmediately: true,
      refreshFolders,
    });

    await flushMicrotasks();
    expect(refreshFolders).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    await flushMicrotasks();
    expect(refreshFolders).toHaveBeenCalledTimes(2);

    cleanup();
  });

  it("polls by interval only when runImmediately is false", async () => {
    const refreshFolders = vi.fn().mockResolvedValue(undefined);
    const cleanup = startFolderPolling({
      enabled: true,
      pollIntervalMs: 1000,
      runImmediately: false,
      refreshFolders,
    });

    await flushMicrotasks();
    expect(refreshFolders).toHaveBeenCalledTimes(0);

    vi.advanceTimersByTime(1000);
    await flushMicrotasks();
    expect(refreshFolders).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it("does not start when disabled", async () => {
    const refreshFolders = vi.fn().mockResolvedValue(undefined);
    const cleanup = startFolderPolling({
      enabled: false,
      pollIntervalMs: 1000,
      refreshFolders,
    });

    vi.advanceTimersByTime(5000);
    await flushMicrotasks();
    expect(refreshFolders).not.toHaveBeenCalled();

    cleanup();
  });

  it("does not overlap in-flight folder refreshes", async () => {
    const firstRefresh = {
      resolve: undefined as ((value?: void | PromiseLike<void>) => void) | undefined,
    };
    const refreshFolders = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          firstRefresh.resolve = resolve;
        }),
    );

    const cleanup = startFolderPolling({
      enabled: true,
      pollIntervalMs: 1000,
      runImmediately: true,
      refreshFolders,
    });

    await flushMicrotasks();
    expect(refreshFolders).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(3000);
    await flushMicrotasks();
    expect(refreshFolders).toHaveBeenCalledTimes(1);

    if (firstRefresh.resolve == null) {
      throw new Error("Expected first refresh resolver");
    }
    firstRefresh.resolve(undefined);
    await flushMicrotasks();

    vi.advanceTimersByTime(1000);
    await flushMicrotasks();
    expect(refreshFolders).toHaveBeenCalledTimes(2);

    cleanup();
  });
});
