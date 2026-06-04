/**
 * Tests for the authentication guard module.
 *
 * The auth guard manages credential access (buildAuthHeader, getCredentials),
 * secure logout (wipeCredentials), and session timeout with activity tracking
 * (initAuthGuard). Broken auth headers would cause 401 errors on every API
 * call; broken wipe would leave credentials in localStorage after logout.
 */

import { Buffer } from "buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let mockInstance: { email: string; apiKey: string; realm: string } | null = null;

vi.mock("./logger", async (importOriginal) => {
  const { createPartialLoggerMock } = await import("~/test/logger-vitest-mock");
  return createPartialLoggerMock(importOriginal as () => Promise<typeof import("./logger")>);
});

describe("auth-guard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockInstance = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  // buildAuthHeader constructs the Authorization header for every Zulip API request
  describe("buildAuthHeader", () => {
    // No instance = not logged in — return empty object so fetch proceeds without auth
    it("returns empty object when no instance exists", async () => {
      mockInstance = null;
      const { buildAuthHeader, setAuthInstanceGetter } = await import("./auth-guard");
      setAuthInstanceGetter(() => mockInstance);
      expect(buildAuthHeader()).toEqual({});
    });

    // Missing apiKey means login hasn't completed — don't send an invalid header
    it("returns empty object when instance has no apiKey", async () => {
      mockInstance = {
        realm: "https://z.example.com",
        email: "user@test.com",
        apiKey: "",
      };
      const { buildAuthHeader, setAuthInstanceGetter } = await import("./auth-guard");
      setAuthInstanceGetter(() => mockInstance);
      expect(buildAuthHeader()).toEqual({});
    });

    // Valid credentials produce a Base64-encoded "email:apiKey" Basic auth header
    it("returns Basic auth header for valid instance", async () => {
      mockInstance = {
        realm: "https://z.example.com",
        email: "user@test.com",
        apiKey: "abc123",
      };
      const { buildAuthHeader, setAuthInstanceGetter } = await import("./auth-guard");
      setAuthInstanceGetter(() => mockInstance);

      const expected = Buffer.from("user@test.com:abc123").toString("base64");
      expect(buildAuthHeader()).toEqual({ Authorization: `Basic ${expected}` });
    });

    // Emails with + and keys with : must be encoded correctly — common edge case
    it("encodes email with special characters correctly", async () => {
      mockInstance = {
        realm: "https://z.example.com",
        email: "user+tag@test.com",
        apiKey: "k:c",
      };
      const { buildAuthHeader, setAuthInstanceGetter } = await import("./auth-guard");
      setAuthInstanceGetter(() => mockInstance);

      const expected = Buffer.from("user+tag@test.com:k:c").toString("base64");
      expect(buildAuthHeader()).toEqual({ Authorization: `Basic ${expected}` });
    });
  });

  // getCredentials extracts the current instance's auth data for API configuration
  describe("getCredentials", () => {
    // No instance = no credentials
    it("returns null when no instance exists", async () => {
      mockInstance = null;
      const { getCredentials, setAuthInstanceGetter } = await import("./auth-guard");
      setAuthInstanceGetter(() => mockInstance);
      expect(getCredentials()).toBeNull();
    });

    // Empty apiKey means the user is in a partially-logged-in state
    it("returns null when instance has no apiKey", async () => {
      mockInstance = {
        realm: "https://z.example.com",
        email: "user@test.com",
        apiKey: "",
      };
      const { getCredentials, setAuthInstanceGetter } = await import("./auth-guard");
      setAuthInstanceGetter(() => mockInstance);
      expect(getCredentials()).toBeNull();
    });

    // Full credentials include realm (server URL), email, and apiKey
    it("returns realm/email/apiKey for valid instance", async () => {
      mockInstance = {
        realm: "https://z.example.com",
        email: "user@test.com",
        apiKey: "abc123",
      };
      const { getCredentials, setAuthInstanceGetter } = await import("./auth-guard");
      setAuthInstanceGetter(() => mockInstance);

      expect(getCredentials()).toEqual({
        realm: "https://z.example.com",
        email: "user@test.com",
        apiKey: "abc123",
      });
    });
  });

  // wipeCredentials is the secure logout — must remove ALL traces of credentials
  describe("wipeCredentials", () => {
    // The store wiper callback is invoked to remove instances from the store
    it("calls storeWiper when set", async () => {
      const wiper = vi.fn();
      const { wipeCredentials, setStoreWiper, setAuthInstanceGetter } =
        await import("./auth-guard");
      setAuthInstanceGetter(() => mockInstance);
      setStoreWiper(wiper);

      wipeCredentials();

      expect(wiper).toHaveBeenCalledOnce();
    });

    // Without an injected store wiper, wipeCredentials must still remove persisted auth keys
    it("removes localStorage keys when no store wiper is registered", async () => {
      localStorage.setItem("zulip-web-instances", '[{"id":"1"}]');
      localStorage.setItem("zulip-web-current-instance", "1");

      const { wipeCredentials, setAuthInstanceGetter } = await import("./auth-guard");
      setAuthInstanceGetter(() => mockInstance);
      wipeCredentials();

      expect(localStorage.getItem("zulip-web-instances")).toBeNull();
      expect(localStorage.getItem("zulip-web-current-instance")).toBeNull();
    });

    // When the app layer injects store cleanup, it owns instance persistence semantics.
    // wipeCredentials must not wipe those keys after the store wiper rewrites them.
    it("does not clobber store-managed instance persistence after wiping current credentials", async () => {
      localStorage.setItem("zulip-web-instances", '[{"id":"1"}]');
      localStorage.setItem("zulip-web-current-instance", "1");

      const { wipeCredentials, setStoreWiper, setAuthInstanceGetter } =
        await import("./auth-guard");
      setAuthInstanceGetter(() => mockInstance);
      setStoreWiper(() => {
        localStorage.setItem("zulip-web-instances", '[{"id":"2"}]');
        localStorage.setItem("zulip-web-current-instance", "2");
      });

      wipeCredentials();

      expect(localStorage.getItem("zulip-web-instances")).toBe('[{"id":"2"}]');
      expect(localStorage.getItem("zulip-web-current-instance")).toBe("2");
    });

    // In some environments (iframe, private mode), localStorage throws — must handle gracefully
    it("does not throw when localStorage is unavailable", async () => {
      const { wipeCredentials, setAuthInstanceGetter } = await import("./auth-guard");
      setAuthInstanceGetter(() => mockInstance);
      const originalRemoveItem = localStorage.removeItem;
      localStorage.removeItem = () => {
        throw new Error("SecurityError");
      };
      try {
        expect(() => wipeCredentials()).not.toThrow();
      } finally {
        localStorage.removeItem = originalRemoveItem;
      }
    });

    // Calling wipe with no store wiper set should be a safe no-op
    it("handles missing store wiper", async () => {
      const { wipeCredentials, setAuthInstanceGetter } = await import("./auth-guard");
      setAuthInstanceGetter(() => mockInstance);
      expect(() => wipeCredentials()).not.toThrow();
    });
  });

  // initAuthGuard starts a session timeout that auto-logs out after inactivity
  describe("initAuthGuard", () => {
    // Without an active instance, the guard should not start any timers
    it("returns no-op if no instances exist", async () => {
      vi.resetModules();
      mockInstance = null;
      const { initAuthGuard, setAuthInstanceGetter } = await import("./auth-guard");
      setAuthInstanceGetter(() => mockInstance);

      const onExpired = vi.fn();
      const cleanup = initAuthGuard({ onSessionExpired: onExpired });

      vi.advanceTimersByTime(25 * 60 * 60 * 1000);
      expect(onExpired).not.toHaveBeenCalled();
      cleanup();
    });

    // Default timeout is 24h — session expires exactly at the boundary
    it("fires onSessionExpired after default 24h timeout", async () => {
      vi.resetModules();
      mockInstance = { realm: "https://z.com", email: "u@t.com", apiKey: "k" };
      const { initAuthGuard, setAuthInstanceGetter } = await import("./auth-guard");
      setAuthInstanceGetter(() => mockInstance);

      const onExpired = vi.fn();
      const cleanup = initAuthGuard({ onSessionExpired: onExpired });

      vi.advanceTimersByTime(24 * 60 * 60 * 1000 - 1);
      expect(onExpired).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(onExpired).toHaveBeenCalledTimes(1);

      cleanup();
    });

    // Custom timeout allows shorter sessions for testing or high-security environments
    it("respects custom timeoutMs", async () => {
      vi.resetModules();
      mockInstance = { realm: "https://z.com", email: "u@t.com", apiKey: "k" };
      const { initAuthGuard, setAuthInstanceGetter } = await import("./auth-guard");
      setAuthInstanceGetter(() => mockInstance);

      const onExpired = vi.fn();
      const cleanup = initAuthGuard({ timeoutMs: 5000, onSessionExpired: onExpired });

      vi.advanceTimersByTime(4999);
      expect(onExpired).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(onExpired).toHaveBeenCalledTimes(1);

      cleanup();
    });

    // Session expiry can run pre-cleanup side effects (e.g. push unregister) before logout redirect
    it("runs onBeforeSessionExpired before onSessionExpired", async () => {
      vi.resetModules();
      mockInstance = { realm: "https://z.com", email: "u@t.com", apiKey: "k" };
      const { initAuthGuard, setAuthInstanceGetter } = await import("./auth-guard");
      setAuthInstanceGetter(() => mockInstance);

      const order: string[] = [];
      const cleanup = initAuthGuard({
        timeoutMs: 1000,
        onBeforeSessionExpired: () => {
          order.push("before");
        },
        onSessionExpired: () => {
          order.push("expired");
        },
      });

      vi.advanceTimersByTime(1000);
      expect(order).toEqual(["before", "expired"]);

      cleanup();
    });

    // Even if pre-cleanup hook fails, logout flow must still complete
    it("still expires session when onBeforeSessionExpired rejects", async () => {
      vi.resetModules();
      mockInstance = { realm: "https://z.com", email: "u@t.com", apiKey: "k" };
      const { initAuthGuard, setAuthInstanceGetter } = await import("./auth-guard");
      setAuthInstanceGetter(() => mockInstance);

      const onExpired = vi.fn();
      const cleanup = initAuthGuard({
        timeoutMs: 1000,
        onBeforeSessionExpired: () => Promise.reject(new Error("unregister failed")),
        onSessionExpired: onExpired,
      });

      vi.advanceTimersByTime(1000);
      expect(onExpired).not.toHaveBeenCalled();

      await Promise.resolve();
      await Promise.resolve();

      expect(onExpired).toHaveBeenCalledTimes(1);
      cleanup();
    });

    // User activity (mousemove) should reset the inactivity timer
    it("resets timer on user activity", async () => {
      vi.resetModules();
      mockInstance = { realm: "https://z.com", email: "u@t.com", apiKey: "k" };
      const { initAuthGuard, setAuthInstanceGetter } = await import("./auth-guard");
      setAuthInstanceGetter(() => mockInstance);

      const onExpired = vi.fn();
      const cleanup = initAuthGuard({ timeoutMs: 10000, onSessionExpired: onExpired });

      vi.advanceTimersByTime(8000);
      window.dispatchEvent(new Event("mousemove"));

      vi.advanceTimersByTime(8000);
      expect(onExpired).not.toHaveBeenCalled();

      vi.advanceTimersByTime(2000);
      expect(onExpired).toHaveBeenCalledTimes(1);

      cleanup();
    });

    // All tracked activity events must reset the timer
    it("resets timer on keydown, click, scroll, touchstart", async () => {
      vi.resetModules();
      mockInstance = { realm: "https://z.com", email: "u@t.com", apiKey: "k" };
      const { initAuthGuard, setAuthInstanceGetter } = await import("./auth-guard");
      setAuthInstanceGetter(() => mockInstance);

      const onExpired = vi.fn();
      const cleanup = initAuthGuard({ timeoutMs: 5000, onSessionExpired: onExpired });

      for (const eventName of ["keydown", "click", "scroll", "touchstart"]) {
        vi.advanceTimersByTime(4000);
        window.dispatchEvent(new Event(eventName));
      }

      vi.advanceTimersByTime(4999);
      expect(onExpired).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(onExpired).toHaveBeenCalledTimes(1);

      cleanup();
    });

    // Double init must be prevented — otherwise two timers would race
    it("prevents double initialization", async () => {
      vi.resetModules();
      mockInstance = { realm: "https://z.com", email: "u@t.com", apiKey: "k" };
      const { initAuthGuard, setAuthInstanceGetter } = await import("./auth-guard");
      setAuthInstanceGetter(() => mockInstance);

      const onExpired1 = vi.fn();
      const onExpired2 = vi.fn();
      const cleanup1 = initAuthGuard({ timeoutMs: 5000, onSessionExpired: onExpired1 });
      const cleanup2 = initAuthGuard({ timeoutMs: 5000, onSessionExpired: onExpired2 });

      vi.advanceTimersByTime(5000);
      expect(onExpired1).toHaveBeenCalledTimes(1);
      expect(onExpired2).not.toHaveBeenCalled();

      cleanup1();
      cleanup2();
    });

    // Cleanup must remove all event listeners and timers — prevents memory leaks
    it("cleanup removes event listeners and clears timer", async () => {
      vi.resetModules();
      mockInstance = { realm: "https://z.com", email: "u@t.com", apiKey: "k" };
      const { initAuthGuard, setAuthInstanceGetter } = await import("./auth-guard");
      setAuthInstanceGetter(() => mockInstance);

      const onExpired = vi.fn();
      const cleanup = initAuthGuard({ timeoutMs: 5000, onSessionExpired: onExpired });
      cleanup();

      vi.advanceTimersByTime(10000);
      expect(onExpired).not.toHaveBeenCalled();
    });

    // After cleanup, re-initialization should work normally (e.g. re-login)
    it("allows re-initialization after cleanup", async () => {
      vi.resetModules();
      mockInstance = { realm: "https://z.com", email: "u@t.com", apiKey: "k" };
      const { initAuthGuard, setAuthInstanceGetter } = await import("./auth-guard");
      setAuthInstanceGetter(() => mockInstance);

      const onExpired1 = vi.fn();
      const cleanup1 = initAuthGuard({ timeoutMs: 3000, onSessionExpired: onExpired1 });
      cleanup1();

      const onExpired2 = vi.fn();
      const cleanup2 = initAuthGuard({ timeoutMs: 2000, onSessionExpired: onExpired2 });
      vi.advanceTimersByTime(2000);
      expect(onExpired2).toHaveBeenCalledTimes(1);
      cleanup2();
    });

    it("does not expire session while tab is hidden longer than timeout", async () => {
      vi.resetModules();
      mockInstance = { realm: "https://z.com", email: "u@t.com", apiKey: "k" };
      const { initAuthGuard, setAuthInstanceGetter } = await import("./auth-guard");
      setAuthInstanceGetter(() => mockInstance);

      const onExpired = vi.fn();
      const cleanup = initAuthGuard({ timeoutMs: 5000, onSessionExpired: onExpired });

      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));

      vi.advanceTimersByTime(20_000);
      expect(onExpired).not.toHaveBeenCalled();

      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "visible",
      });
      document.dispatchEvent(new Event("visibilitychange"));

      vi.advanceTimersByTime(5000);
      expect(onExpired).toHaveBeenCalledTimes(1);

      cleanup();
    });
  });
});
