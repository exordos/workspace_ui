import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getWorkspaceRateLimitBlockedUntil,
  ingestMessengerRateLimitFromApiResponse,
  resetWorkspaceRateLimitGateForTests,
  subscribeWorkspaceRateLimitGate,
  waitUntilMessengerRateLimitReleased,
} from "./messenger-rate-limit-gate";

vi.mock("./logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe("messenger-rate-limit-gate", () => {
  beforeEach(() => {
    resetWorkspaceRateLimitGateForTests();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    resetWorkspaceRateLimitGateForTests();
  });

  it("extends blockedUntil from RATE_LIMIT_HIT with fractional retry-after", () => {
    ingestMessengerRateLimitFromApiResponse(
      200,
      { result: "error", code: "RATE_LIMIT_HIT", msg: "limit", "retry-after": 0.25 },
      new Headers(),
    );
    const until = getWorkspaceRateLimitBlockedUntil();
    expect(until).toBe(Date.now() + 250);
  });

  it("accepts RATE_LIMITED code", () => {
    ingestMessengerRateLimitFromApiResponse(
      200,
      { result: "error", code: "RATE_LIMITED", "retry-after": 2 },
      new Headers(),
    );
    expect(getWorkspaceRateLimitBlockedUntil()).toBe(Date.now() + 2000);
  });

  it("coalesces to max when a longer window arrives", () => {
    ingestMessengerRateLimitFromApiResponse(
      200,
      { result: "error", code: "RATE_LIMIT_HIT", "retry-after": 1 },
      new Headers(),
    );
    const first = getWorkspaceRateLimitBlockedUntil();
    ingestMessengerRateLimitFromApiResponse(
      200,
      { result: "error", code: "RATE_LIMIT_HIT", "retry-after": 5 },
      new Headers(),
    );
    expect(getWorkspaceRateLimitBlockedUntil()).toBeGreaterThan(first);
    expect(getWorkspaceRateLimitBlockedUntil()).toBe(Date.now() + 5000);
  });

  it("does not shorten an existing longer window", () => {
    ingestMessengerRateLimitFromApiResponse(
      200,
      { result: "error", code: "RATE_LIMIT_HIT", "retry-after": 10 },
      new Headers(),
    );
    const long = getWorkspaceRateLimitBlockedUntil();
    ingestMessengerRateLimitFromApiResponse(
      200,
      { result: "error", code: "RATE_LIMIT_HIT", "retry-after": 1 },
      new Headers(),
    );
    expect(getWorkspaceRateLimitBlockedUntil()).toBe(long);
  });

  it("ingests HTTP 429 with Retry-After header", () => {
    ingestMessengerRateLimitFromApiResponse(
      429,
      { result: "error", msg: "x" },
      new Headers({ "Retry-After": "3" }),
    );
    expect(getWorkspaceRateLimitBlockedUntil()).toBe(Date.now() + 3000);
  });

  it("no-ops for unrelated errors", () => {
    ingestMessengerRateLimitFromApiResponse(
      400,
      { result: "error", code: "BAD_REQUEST", msg: "x" },
      new Headers(),
    );
    expect(getWorkspaceRateLimitBlockedUntil()).toBe(0);
  });

  it("notifies subscribers when block is extended", () => {
    const spy = vi.fn();
    subscribeWorkspaceRateLimitGate(spy);
    ingestMessengerRateLimitFromApiResponse(
      200,
      { result: "error", code: "RATE_LIMIT_HIT", "retry-after": 1 },
      new Headers(),
    );
    expect(spy).toHaveBeenCalledOnce();
  });

  it("waitUntilMessengerRateLimitReleased resolves after the window", async () => {
    ingestMessengerRateLimitFromApiResponse(
      200,
      { result: "error", code: "RATE_LIMIT_HIT", "retry-after": 0.1 },
      new Headers(),
    );
    const p = waitUntilMessengerRateLimitReleased();
    await vi.advanceTimersByTimeAsync(100);
    await expect(p).resolves.toBeUndefined();
  });

  it("waitUntilMessengerRateLimitReleased rejects when signal aborts", async () => {
    ingestMessengerRateLimitFromApiResponse(
      200,
      { result: "error", code: "RATE_LIMIT_HIT", "retry-after": 10 },
      new Headers(),
    );
    const ac = new AbortController();
    const p = waitUntilMessengerRateLimitReleased(ac.signal);
    ac.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
  });
});
