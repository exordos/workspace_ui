import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getZulipRateLimitBlockedUntil,
  ingestZulipRateLimitFromApiResponse,
  resetZulipRateLimitGateForTests,
  subscribeZulipRateLimitGate,
  waitUntilZulipRateLimitReleased,
} from "./zulip-rate-limit-gate";

vi.mock("./logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe("zulip-rate-limit-gate", () => {
  beforeEach(() => {
    resetZulipRateLimitGateForTests();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    resetZulipRateLimitGateForTests();
  });

  it("extends blockedUntil from RATE_LIMIT_HIT with fractional retry-after", () => {
    ingestZulipRateLimitFromApiResponse(
      200,
      { result: "error", code: "RATE_LIMIT_HIT", msg: "limit", "retry-after": 0.25 },
      new Headers(),
    );
    const until = getZulipRateLimitBlockedUntil();
    expect(until).toBe(Date.now() + 250);
  });

  it("accepts RATE_LIMITED code", () => {
    ingestZulipRateLimitFromApiResponse(
      200,
      { result: "error", code: "RATE_LIMITED", "retry-after": 2 },
      new Headers(),
    );
    expect(getZulipRateLimitBlockedUntil()).toBe(Date.now() + 2000);
  });

  it("coalesces to max when a longer window arrives", () => {
    ingestZulipRateLimitFromApiResponse(
      200,
      { result: "error", code: "RATE_LIMIT_HIT", "retry-after": 1 },
      new Headers(),
    );
    const first = getZulipRateLimitBlockedUntil();
    ingestZulipRateLimitFromApiResponse(
      200,
      { result: "error", code: "RATE_LIMIT_HIT", "retry-after": 5 },
      new Headers(),
    );
    expect(getZulipRateLimitBlockedUntil()).toBeGreaterThan(first);
    expect(getZulipRateLimitBlockedUntil()).toBe(Date.now() + 5000);
  });

  it("does not shorten an existing longer window", () => {
    ingestZulipRateLimitFromApiResponse(
      200,
      { result: "error", code: "RATE_LIMIT_HIT", "retry-after": 10 },
      new Headers(),
    );
    const long = getZulipRateLimitBlockedUntil();
    ingestZulipRateLimitFromApiResponse(
      200,
      { result: "error", code: "RATE_LIMIT_HIT", "retry-after": 1 },
      new Headers(),
    );
    expect(getZulipRateLimitBlockedUntil()).toBe(long);
  });

  it("ingests HTTP 429 with Retry-After header", () => {
    ingestZulipRateLimitFromApiResponse(429, { result: "error", msg: "x" }, new Headers({ "Retry-After": "3" }));
    expect(getZulipRateLimitBlockedUntil()).toBe(Date.now() + 3000);
  });

  it("no-ops for unrelated errors", () => {
    ingestZulipRateLimitFromApiResponse(
      400,
      { result: "error", code: "BAD_REQUEST", msg: "x" },
      new Headers(),
    );
    expect(getZulipRateLimitBlockedUntil()).toBe(0);
  });

  it("notifies subscribers when block is extended", () => {
    const spy = vi.fn();
    subscribeZulipRateLimitGate(spy);
    ingestZulipRateLimitFromApiResponse(
      200,
      { result: "error", code: "RATE_LIMIT_HIT", "retry-after": 1 },
      new Headers(),
    );
    expect(spy).toHaveBeenCalledOnce();
  });

  it("waitUntilZulipRateLimitReleased resolves after the window", async () => {
    ingestZulipRateLimitFromApiResponse(
      200,
      { result: "error", code: "RATE_LIMIT_HIT", "retry-after": 0.1 },
      new Headers(),
    );
    const p = waitUntilZulipRateLimitReleased();
    await vi.advanceTimersByTimeAsync(100);
    await expect(p).resolves.toBeUndefined();
  });

  it("waitUntilZulipRateLimitReleased rejects when signal aborts", async () => {
    ingestZulipRateLimitFromApiResponse(
      200,
      { result: "error", code: "RATE_LIMIT_HIT", "retry-after": 10 },
      new Headers(),
    );
    const ac = new AbortController();
    const p = waitUntilZulipRateLimitReleased(ac.signal);
    ac.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
  });
});
