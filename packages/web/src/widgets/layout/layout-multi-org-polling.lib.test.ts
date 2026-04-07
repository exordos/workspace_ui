import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ZulipInstance } from "~/entities/instance/instance.model";
import { startInactiveInstanceUnreadPolling } from "./layout-multi-org-polling.lib";

const INSTANCES: ZulipInstance[] = [
  { id: "inst-1", realm: "https://a.example.com", email: "a@example.com", apiKey: "k1" },
  { id: "inst-2", realm: "https://b.example.com", email: "b@example.com", apiKey: "k2" },
  { id: "inst-3", realm: "https://c.example.com", email: "c@example.com", apiKey: "k3" },
];

describe("startInactiveInstanceUnreadPolling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("polls inactive instances immediately and on interval", async () => {
    const fetchUnreadCount = vi
      .fn()
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(3);
    const setUnreadCount = vi.fn();

    const stop = startInactiveInstanceUnreadPolling({
      instances: INSTANCES,
      currentInstanceId: "inst-1",
      enabled: true,
      online: true,
      pollIntervalMs: 1000,
      fetchUnreadCount,
      setUnreadCount,
    });

    await vi.waitFor(() => {
      expect(fetchUnreadCount).toHaveBeenCalledTimes(2);
    });
    expect(setUnreadCount).toHaveBeenCalledWith("inst-2", 4);
    expect(setUnreadCount).toHaveBeenCalledWith("inst-3", 2);

    await vi.advanceTimersByTimeAsync(1000);

    expect(fetchUnreadCount).toHaveBeenCalledTimes(4);
    expect(setUnreadCount).toHaveBeenCalledWith("inst-2", 5);
    expect(setUnreadCount).toHaveBeenCalledWith("inst-3", 3);

    stop();
  });

  it("does not poll when feature is disabled", async () => {
    const fetchUnreadCount = vi.fn().mockResolvedValue(1);
    const setUnreadCount = vi.fn();

    const stop = startInactiveInstanceUnreadPolling({
      instances: INSTANCES,
      currentInstanceId: "inst-1",
      enabled: false,
      online: true,
      pollIntervalMs: 1000,
      fetchUnreadCount,
      setUnreadCount,
    });

    await vi.advanceTimersByTimeAsync(1500);
    expect(fetchUnreadCount).not.toHaveBeenCalled();
    expect(setUnreadCount).not.toHaveBeenCalled();
    stop();
  });

  it("aborts in-flight polling on cleanup", async () => {
    const aborted = vi.fn();
    const fetchUnreadCount = vi.fn((_instance: ZulipInstance, signal: AbortSignal) => {
      return new Promise<number | null>((resolve) => {
        signal.addEventListener("abort", () => {
          aborted();
          resolve(null);
        });
      });
    });

    const stop = startInactiveInstanceUnreadPolling({
      instances: INSTANCES,
      currentInstanceId: "inst-1",
      enabled: true,
      online: true,
      pollIntervalMs: 5000,
      fetchUnreadCount,
      setUnreadCount: vi.fn(),
    });

    await vi.waitFor(() => {
      expect(fetchUnreadCount).toHaveBeenCalledTimes(2);
    });

    stop();
    expect(aborted).toHaveBeenCalled();
  });

  it("reports errors without stopping future polls", async () => {
    const error = new Error("boom");
    const fetchUnreadCount = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const onError = vi.fn();
    const setUnreadCount = vi.fn();

    const stop = startInactiveInstanceUnreadPolling({
      instances: INSTANCES,
      currentInstanceId: "inst-1",
      enabled: true,
      online: true,
      pollIntervalMs: 1000,
      fetchUnreadCount,
      setUnreadCount,
      onError,
    });

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledWith("inst-2", error);
    });
    expect(setUnreadCount).toHaveBeenCalledWith("inst-3", 6);

    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchUnreadCount).toHaveBeenCalledTimes(4);
    expect(setUnreadCount).toHaveBeenCalledWith("inst-2", 1);
    expect(setUnreadCount).toHaveBeenCalledWith("inst-3", 2);

    stop();
  });
});
