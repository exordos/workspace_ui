import { describe, expect, it, vi } from "vitest";
import { registerPushTokenWithRetry, sleepMs } from "./push-register-retry.lib";

describe("registerPushTokenWithRetry", () => {
  it("returns immediately on first success", async () => {
    const registerFn = vi.fn().mockResolvedValue(true);
    const result = await registerPushTokenWithRetry(registerFn, "token-abc");
    expect(result).toEqual({ ok: true, lastError: null, attempts: 1 });
    expect(registerFn).toHaveBeenCalledTimes(1);
  });

  it("retries with backoff until success", async () => {
    vi.useFakeTimers();
    const registerFn = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const promise = registerPushTokenWithRetry(registerFn, "token-abc");
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;

    expect(result.ok).toBe(true);
    expect(registerFn).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it("returns failure after exhausting retries", async () => {
    vi.useFakeTimers();
    const registerFn = vi.fn().mockResolvedValue(false);

    const promise = registerPushTokenWithRetry(registerFn, "token-abc");
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);
    const result = await promise;

    expect(result).toEqual({
      ok: false,
      lastError: "Push token registration rejected by server",
      attempts: 4,
    });
    expect(registerFn).toHaveBeenCalledTimes(4);
    vi.useRealTimers();
  });
});

describe("sleepMs", () => {
  it("resolves after delay", async () => {
    vi.useFakeTimers();
    const promise = sleepMs(500);
    await vi.advanceTimersByTimeAsync(500);
    await expect(promise).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});
