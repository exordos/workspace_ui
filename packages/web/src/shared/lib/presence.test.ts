/**
 * Tests for presence tracking — detects if the user is active, idle, or offline.
 *
 * Monitors user activity (mouse, keyboard, visibility) and reports presence
 * status to the server. Also tests the formatLastSeen/getPresenceState helpers
 * that convert raw presence data into human-readable strings and UI states.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getLocalPresenceStatus,
  getLastActivityTimestamp,
  getIdleTimeMs,
  initPresenceTracker,
  setPresenceReporter,
} from "./presence";

// Core presence tracker: init, status detection, idle time, and reporter callback.
describe("presence tracker", () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    vi.useRealTimers();
  });

  // Status must always be one of the three valid values.
  it("getLocalPresenceStatus returns a valid status", () => {
    const status = getLocalPresenceStatus();
    expect(["active", "idle", "offline"]).toContain(status);
  });

  // Timestamp tracks the last user interaction for idle detection.
  it("getLastActivityTimestamp returns a number", () => {
    expect(typeof getLastActivityTimestamp()).toBe("number");
  });

  // Idle time must never be negative — it's the delta since last activity.
  it("getIdleTimeMs returns non-negative number", () => {
    expect(getIdleTimeMs()).toBeGreaterThanOrEqual(0);
  });

  // Reporter callback is called when presence status changes — must accept any function.
  it("setPresenceReporter accepts a function", () => {
    const fn = vi.fn();
    expect(() => setPresenceReporter(fn)).not.toThrow();
  });

  // Init must return cleanup to remove event listeners on unmount.
  it("initPresenceTracker returns cleanup function", () => {
    cleanup = initPresenceTracker();
    expect(typeof cleanup).toBe("function");
  });

  // A visible tab with recent activity should report "active".
  it("starts as active when tab is visible", () => {
    cleanup = initPresenceTracker();
    expect(getLocalPresenceStatus()).toBe("active");
  });

  // The reporter must be called immediately on init so the server knows we're here.
  it("reports presence on init", () => {
    const reporter = vi.fn();
    setPresenceReporter(reporter);
    cleanup = initPresenceTracker();
    expect(reporter).toHaveBeenCalledWith("active");
  });
});

// formatLastSeen produces human-readable strings like "5 min ago" or "online".
describe("formatLastSeen integration", () => {
  it("formats online presence as non-empty string", async () => {
    const { formatLastSeen } = await import("./format");
    const now = Math.floor(Date.now() / 1000);
    const result = formatLastSeen(now, "active");
    expect(result.length).toBeGreaterThan(0);
  });

  it("formats away presence as non-empty string", async () => {
    const { formatLastSeen } = await import("./format");
    const now = Math.floor(Date.now() / 1000);
    const result = formatLastSeen(now - 180, "idle");
    expect(result.length).toBeGreaterThan(0);
  });

  it("formats old presence as non-empty string", async () => {
    const { formatLastSeen } = await import("./format");
    const now = Math.floor(Date.now() / 1000);
    const result = formatLastSeen(now - 900);
    expect(result.length).toBeGreaterThan(0);
  });
});

// getPresenceState maps timestamp + status into a UI-friendly state (active/idle/offline).
describe("getPresenceState", () => {
  // Recent activity + active status = green dot.
  it("returns active for recent active user", async () => {
    const { getPresenceState } = await import("./format");
    const now = Math.floor(Date.now() / 1000);
    expect(getPresenceState(now, "active")).toBe("active");
  });

  // Recent but idle = yellow dot.
  it("returns idle for recent idle user", async () => {
    const { getPresenceState } = await import("./format");
    const now = Math.floor(Date.now() / 1000);
    expect(getPresenceState(now - 180, "idle")).toBe("idle");
  });

  // Stale timestamp (>1h ago) = offline regardless of reported status.
  it("returns offline for stale timestamp", async () => {
    const { getPresenceState } = await import("./format");
    const now = Math.floor(Date.now() / 1000);
    expect(getPresenceState(now - 3600, "idle")).toBe("offline");
  });
});

// Edge cases: double init, reporter callback behavior, idle timeout
describe("presence tracker edge cases", () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    setPresenceReporter(() => {});
    vi.useRealTimers();
  });

  // Double initialization must be a safe no-op — returns an empty cleanup.
  it("double init returns noop cleanup (idempotent)", () => {
    cleanup = initPresenceTracker();
    const secondCleanup = initPresenceTracker();
    expect(typeof secondCleanup).toBe("function");
    secondCleanup();
  });

  // After cleanup, the tracker should no longer be active for re-init.
  it("cleanup allows re-initialization", () => {
    cleanup = initPresenceTracker();
    cleanup();
    cleanup = undefined;

    const newCleanup = initPresenceTracker();
    expect(typeof newCleanup).toBe("function");
    cleanup = newCleanup;
  });

  // Activity timestamp updates on simulated user interaction.
  it("getLastActivityTimestamp returns recent value after init", () => {
    const before = Date.now();
    cleanup = initPresenceTracker();
    expect(getLastActivityTimestamp()).toBeGreaterThanOrEqual(before);
  });

  // Idle time is zero right after init (fresh activity).
  it("getIdleTimeMs returns near-zero right after init", () => {
    cleanup = initPresenceTracker();
    expect(getIdleTimeMs()).toBeLessThan(100);
  });

  // Reporter function is called with current status on init.
  it("calls reporter with status on init when reporter is set", () => {
    const reporter = vi.fn();
    setPresenceReporter(reporter);
    cleanup = initPresenceTracker();
    expect(reporter).toHaveBeenCalledWith(expect.stringMatching(/^(active|idle)$/));
  });

  // The reporter is called periodically (60s interval).
  it("reports presence periodically", () => {
    const reporter = vi.fn();
    setPresenceReporter(reporter);
    cleanup = initPresenceTracker();

    reporter.mockClear();
    vi.advanceTimersByTime(60_000);
    expect(reporter).toHaveBeenCalled();
  });

  // After cleanup, periodic reporting stops.
  it("stops reporting after cleanup", () => {
    const reporter = vi.fn();
    setPresenceReporter(reporter);
    cleanup = initPresenceTracker();
    cleanup();
    cleanup = undefined;

    reporter.mockClear();
    vi.advanceTimersByTime(120_000);
    expect(reporter).not.toHaveBeenCalled();
  });
});
