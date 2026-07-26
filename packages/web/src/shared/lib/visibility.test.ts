/**
 * Tests for the tab visibility tracking module.
 *
 * Verifies detection of tab foreground/background state, visibility change
 * subscriptions, stale-tab resume detection (hidden >30s), and resilient
 * intervals that catch up after the tab returns to foreground. Background
 * tabs throttle timers in browsers, so this module is essential for keeping
 * the event loop and presence tracking reliable.
 */
import { describe, expect, it, vi, beforeAll, afterEach } from "vitest";
import {
  isWindowActive,
  isTabVisible,
  onVisibilityChange,
  onTabResume,
  initVisibilityTracking,
  createResilientInterval,
} from "./visibility";

describe("visibility", () => {
  let cleanups: (() => void)[] = [];

  beforeAll(() => {
    initVisibilityTracking();
  });

  afterEach(() => {
    cleanups.forEach((fn) => fn());
    cleanups = [];
    vi.useRealTimers();
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
  });

  // Checks that isTabVisible() correctly wraps document.visibilityState
  describe("isTabVisible", () => {
    // Baseline: tab should report visible when the browser says so
    it("returns true when visibilityState is visible", () => {
      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        configurable: true,
      });
      expect(isTabVisible()).toBe(true);
    });

    // Hidden state means timers are throttled — app logic must adapt
    it("returns false when visibilityState is hidden", () => {
      Object.defineProperty(document, "visibilityState", {
        value: "hidden",
        configurable: true,
      });
      expect(isTabVisible()).toBe(false);
    });
  });

  describe("isWindowActive", () => {
    it("requires both a visible tab and a focused window", () => {
      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        configurable: true,
      });
      const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(false);

      expect(isWindowActive()).toBe(false);

      hasFocus.mockReturnValue(true);
      expect(isWindowActive()).toBe(true);
      hasFocus.mockRestore();
    });
  });

  // Verifies the pub/sub pattern for visibility change events
  describe("onVisibilityChange", () => {
    // Cleanup must work to prevent memory leaks
    it("returns an unsubscribe function", () => {
      const unsub = onVisibilityChange(vi.fn());
      expect(typeof unsub).toBe("function");
      unsub();
    });

    // Used by presence tracking to mark user as active when tab comes back
    it("callback receives true when tab becomes visible", () => {
      const cb = vi.fn();
      cleanups.push(onVisibilityChange(cb));

      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));

      expect(cb).toHaveBeenCalledWith(true);
    });

    // Used to pause expensive operations when the user switches away
    it("callback receives false when tab becomes hidden", () => {
      const cb = vi.fn();
      cleanups.push(onVisibilityChange(cb));

      Object.defineProperty(document, "visibilityState", {
        value: "hidden",
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));

      expect(cb).toHaveBeenCalledWith(false);
    });

    // Ensures unsubscribe actually removes the listener
    it("unsubscribed callback is not called", () => {
      const cb = vi.fn();
      const unsub = onVisibilityChange(cb);
      unsub();

      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));

      expect(cb).not.toHaveBeenCalled();
    });

    // One bad subscriber must not break the entire notification chain
    it("one failing callback does not prevent others from firing", () => {
      const failing = vi.fn(() => {
        throw new Error("boom");
      });
      const passing = vi.fn();
      cleanups.push(onVisibilityChange(failing));
      cleanups.push(onVisibilityChange(passing));

      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));

      expect(failing).toHaveBeenCalled();
      expect(passing).toHaveBeenCalled();
    });
  });

  // onTabResume detects when a tab returns after being hidden >30s (stale data)
  describe("onTabResume", () => {
    // After 30s+ hidden, cached data is stale — triggers re-fetch of event queue
    it("fires when tab was hidden longer than stale threshold (30s)", () => {
      vi.useFakeTimers();
      const cb = vi.fn();
      cleanups.push(onTabResume(cb));

      Object.defineProperty(document, "visibilityState", {
        value: "hidden",
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));

      vi.advanceTimersByTime(31_000);

      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));

      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb.mock.calls[0]![0]).toBeGreaterThanOrEqual(31_000);
    });

    // Short tab switches shouldn't trigger expensive re-sync operations
    it("does not fire when tab was hidden less than 30s", () => {
      vi.useFakeTimers();
      const cb = vi.fn();
      cleanups.push(onTabResume(cb));

      Object.defineProperty(document, "visibilityState", {
        value: "hidden",
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));

      vi.advanceTimersByTime(5_000);

      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));

      expect(cb).not.toHaveBeenCalled();
    });
  });

  // Resilient intervals compensate for browser timer throttling in background tabs
  describe("createResilientInterval", () => {
    // Basic timer behavior: fires at the expected cadence
    it("fires callback at regular intervals", () => {
      vi.useFakeTimers();
      const cb = vi.fn();
      const stop = createResilientInterval(cb, 1000);
      cleanups.push(stop);

      vi.advanceTimersByTime(3000);
      expect(cb).toHaveBeenCalledTimes(3);
    });

    // Cleanup must stop the timer to prevent memory leaks
    it("stops firing after cleanup", () => {
      vi.useFakeTimers();
      const cb = vi.fn();
      const stop = createResilientInterval(cb, 1000);

      vi.advanceTimersByTime(2000);
      expect(cb).toHaveBeenCalledTimes(2);

      stop();
      vi.advanceTimersByTime(3000);
      expect(cb).toHaveBeenCalledTimes(2);
    });

    // Key feature: catches up immediately when returning from a background tab
    it("fires immediately when tab becomes visible and interval is overdue", () => {
      vi.useFakeTimers();
      const cb = vi.fn();
      const stop = createResilientInterval(cb, 1000);
      cleanups.push(stop);

      vi.advanceTimersByTime(1000);
      expect(cb).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(950);
      expect(cb).toHaveBeenCalledTimes(1);

      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));

      expect(cb).toHaveBeenCalledTimes(2);
    });

    // Avoids double-firing if the timer is still within its normal cadence
    it("does not fire on visibility change when interval is not overdue", () => {
      vi.useFakeTimers();
      const cb = vi.fn();
      const stop = createResilientInterval(cb, 1000);
      cleanups.push(stop);

      vi.advanceTimersByTime(500);
      expect(cb).not.toHaveBeenCalled();

      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));

      expect(cb).not.toHaveBeenCalled();
    });
  });

  // Smoke test: init should be safe to call in any browser environment
  describe("initVisibilityTracking", () => {
    it("does not throw in browser environment", () => {
      expect(() => initVisibilityTracking()).not.toThrow();
    });
  });
});
