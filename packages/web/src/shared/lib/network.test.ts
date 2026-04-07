/**
 * Tests for the network status tracking module.
 *
 * Verifies online/offline detection, status change subscriptions,
 * reconnect detection (offline→online transitions), and the waitForOnline
 * promise helper. These are critical for the app's network-awareness layer
 * that gates API calls and triggers re-fetches after connectivity loss.
 */
import { describe, expect, it, vi, beforeAll, afterEach } from "vitest";
import {
  isOnline,
  onStatusChange,
  onReconnect,
  initNetworkTracking,
  waitForOnline,
} from "./network";

describe("network", () => {
  let cleanups: (() => void)[] = [];

  beforeAll(() => {
    initNetworkTracking();
  });

  afterEach(() => {
    cleanups.forEach((fn) => fn());
    cleanups = [];
    Object.defineProperty(navigator, "onLine", {
      value: true,
      configurable: true,
    });
  });

  // Checks that isOnline() correctly reflects navigator.onLine state
  describe("isOnline", () => {
    // Baseline: the app should report online when the browser says so
    it("returns true when navigator.onLine is true", () => {
      Object.defineProperty(navigator, "onLine", {
        value: true,
        configurable: true,
      });
      expect(isOnline()).toBe(true);
    });

    // Ensures offline state is properly detected so we can pause network operations
    it("returns false when navigator.onLine is false", () => {
      Object.defineProperty(navigator, "onLine", {
        value: false,
        configurable: true,
      });
      expect(isOnline()).toBe(false);
    });
  });

  // Verifies the pub/sub pattern for network status changes
  describe("onStatusChange", () => {
    // Cleanup must work to prevent memory leaks from dangling listeners
    it("returns an unsubscribe function", () => {
      const unsub = onStatusChange(vi.fn());
      expect(typeof unsub).toBe("function");
      unsub();
    });

    // Subscribers need to know when connectivity is restored to resume operations
    it("callback receives true on online event", () => {
      const cb = vi.fn();
      cleanups.push(onStatusChange(cb));
      window.dispatchEvent(new Event("online"));
      expect(cb).toHaveBeenCalledWith(true);
    });

    // Subscribers need to know when connectivity is lost to show offline UI
    it("callback receives false on offline event", () => {
      const cb = vi.fn();
      cleanups.push(onStatusChange(cb));
      window.dispatchEvent(new Event("offline"));
      expect(cb).toHaveBeenCalledWith(false);
    });

    // Ensures unsubscribe actually removes the listener to prevent leaks
    it("unsubscribed callback is not called", () => {
      const cb = vi.fn();
      const unsub = onStatusChange(cb);
      unsub();
      window.dispatchEvent(new Event("online"));
      expect(cb).not.toHaveBeenCalled();
    });

    // One bad subscriber must not break the entire notification chain
    it("one failing callback does not prevent others from firing", () => {
      const failing = vi.fn(() => {
        throw new Error("boom");
      });
      const passing = vi.fn();
      cleanups.push(onStatusChange(failing));
      cleanups.push(onStatusChange(passing));

      window.dispatchEvent(new Event("online"));
      expect(failing).toHaveBeenCalled();
      expect(passing).toHaveBeenCalled();
    });
  });

  // Reconnect fires only on offline→online transition, used to re-register event queues
  describe("onReconnect", () => {
    // Cleanup must work to avoid duplicate re-fetch triggers
    it("returns an unsubscribe function", () => {
      const unsub = onReconnect(vi.fn());
      expect(typeof unsub).toBe("function");
      unsub();
    });

    // The core use case: detect when we come back online to re-sync data
    it("fires after offline→online transition", () => {
      const cb = vi.fn();
      cleanups.push(onReconnect(cb));

      window.dispatchEvent(new Event("offline"));
      expect(cb).not.toHaveBeenCalled();

      window.dispatchEvent(new Event("online"));
      expect(cb).toHaveBeenCalledTimes(1);
    });

    // Prevents duplicate re-syncs when multiple online events fire without going offline
    it("does not fire on second online without offline in between", () => {
      const cb = vi.fn();
      cleanups.push(onReconnect(cb));

      window.dispatchEvent(new Event("offline"));
      window.dispatchEvent(new Event("online"));
      expect(cb).toHaveBeenCalledTimes(1);

      window.dispatchEvent(new Event("online"));
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  // Promise-based helper so callers can `await waitForOnline()` before making API calls
  describe("waitForOnline", () => {
    // Should not block when already connected
    it("resolves immediately when already online", async () => {
      Object.defineProperty(navigator, "onLine", {
        value: true,
        configurable: true,
      });
      await expect(waitForOnline()).resolves.toBeUndefined();
    });

    // Should wait until connectivity is restored, then resolve
    it("resolves when transitioning from offline to online", async () => {
      Object.defineProperty(navigator, "onLine", {
        value: false,
        configurable: true,
      });
      const promise = waitForOnline();

      Object.defineProperty(navigator, "onLine", {
        value: true,
        configurable: true,
      });
      window.dispatchEvent(new Event("online"));

      await promise;
    });
  });

  // Smoke test: init should be safe to call in any browser environment
  describe("initNetworkTracking", () => {
    it("does not throw in browser environment", () => {
      expect(() => initNetworkTracking()).not.toThrow();
    });
  });
});
