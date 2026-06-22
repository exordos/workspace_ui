/**
 * Tests for IAM-only authentication guard behavior.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let mockInstance: {
  login: string;
  realm: string;
  authType: "iam";
  iamAccessToken?: string;
  iamRefreshToken?: string;
} | null = null;

function iamInstance(token = "access-token") {
  return {
    realm: "https://z.example.com",
    login: "user@test.com",
    authType: "iam" as const,
    iamAccessToken: token,
  };
}

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

  describe("buildAuthHeader", () => {
    it("returns empty object when no instance exists", async () => {
      const { buildAuthHeader, setAuthInstanceGetter } = await import("./auth-guard");
      setAuthInstanceGetter(() => mockInstance);
      expect(buildAuthHeader()).toEqual({});
    });

    it("returns empty object when IAM token is missing", async () => {
      mockInstance = iamInstance("");
      const { buildAuthHeader, setAuthInstanceGetter } = await import("./auth-guard");
      setAuthInstanceGetter(() => mockInstance);
      expect(buildAuthHeader()).toEqual({});
    });

    it("returns Bearer auth header for IAM token", async () => {
      mockInstance = iamInstance("token-123");
      const { buildAuthHeader, setAuthInstanceGetter } = await import("./auth-guard");
      setAuthInstanceGetter(() => mockInstance);
      expect(buildAuthHeader()).toEqual({ Authorization: "Bearer token-123" });
    });
  });

  describe("getCredentials", () => {
    it("returns null when no instance exists", async () => {
      const { getCredentials, setAuthInstanceGetter } = await import("./auth-guard");
      setAuthInstanceGetter(() => mockInstance);
      expect(getCredentials()).toBeNull();
    });

    it("returns IAM access token credentials", async () => {
      mockInstance = iamInstance("token-123");
      const { getCredentials, setAuthInstanceGetter } = await import("./auth-guard");
      setAuthInstanceGetter(() => mockInstance);
      expect(getCredentials()).toEqual({
        realm: "https://z.example.com",
        login: "user@test.com",
        accessToken: "token-123",
      });
    });
  });

  describe("wipeCredentials", () => {
    it("calls storeWiper when set", async () => {
      const wiper = vi.fn();
      const { wipeCredentials, setStoreWiper, setAuthInstanceGetter } =
        await import("./auth-guard");
      setAuthInstanceGetter(() => mockInstance);
      setStoreWiper(wiper);

      wipeCredentials();

      expect(wiper).toHaveBeenCalledOnce();
    });

    it("removes localStorage keys when no store wiper is registered", async () => {
      localStorage.setItem("messenger-web-instances", '[{"id":"1"}]');
      localStorage.setItem("messenger-web-current-instance", "1");

      const { wipeCredentials, setAuthInstanceGetter } = await import("./auth-guard");
      setAuthInstanceGetter(() => mockInstance);
      wipeCredentials();

      expect(localStorage.getItem("messenger-web-instances")).toBeNull();
      expect(localStorage.getItem("messenger-web-current-instance")).toBeNull();
    });
  });

  describe("initAuthGuard", () => {
    it("returns no-op if no instances exist", async () => {
      const { initAuthGuard, setAuthInstanceGetter } = await import("./auth-guard");
      setAuthInstanceGetter(() => mockInstance);

      const onExpired = vi.fn();
      const cleanup = initAuthGuard({ onSessionExpired: onExpired });

      vi.advanceTimersByTime(25 * 60 * 60 * 1000);
      expect(onExpired).not.toHaveBeenCalled();
      cleanup();
    });

    it("fires onSessionExpired after default 24h timeout", async () => {
      mockInstance = iamInstance();
      const { initAuthGuard, setAuthInstanceGetter } = await import("./auth-guard");
      setAuthInstanceGetter(() => mockInstance);

      const onExpired = vi.fn();
      const cleanup = initAuthGuard({ onSessionExpired: onExpired });

      vi.advanceTimersByTime(24 * 60 * 60 * 1000);
      expect(onExpired).toHaveBeenCalledTimes(1);

      cleanup();
    });

    it("resets timer on user activity", async () => {
      mockInstance = iamInstance();
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
  });
});
