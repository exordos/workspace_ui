/**
 * Tests for the Yandex Metrika (YM) analytics provider.
 *
 * Verifies counter initialization, goal tracking (reachGoal), page hits,
 * user identification (userParams), consent gating, and reset. YM uses a
 * global `window.ym` function with a counter ID as the first argument.
 * This provider is used alongside GA4 for Russian-market analytics.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createYMProvider } from "~/shared/lib/analytics/ym";

vi.mock("../logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe("ym (Yandex Metrika)", () => {
  let originalYm: typeof window.ym | undefined;
  let dummyScript: HTMLScriptElement;

  beforeEach(() => {
    originalYm = window.ym;
    (window as unknown as Record<string, unknown>).ym = vi.fn();

    dummyScript = document.createElement("script");
    dummyScript.src = "dummy.js";
    document.head.appendChild(dummyScript);
  });

  afterEach(() => {
    if (originalYm) {
      window.ym = originalYm;
    } else {
      delete (window as unknown as Record<string, unknown>).ym;
    }
    dummyScript.remove();
    document.querySelectorAll("script[src*='yandex']").forEach((el) => el.remove());
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // createYMProvider
  // ---------------------------------------------------------------------------

  // Verifies factory function returns a complete provider interface
  describe("createYMProvider", () => {
    // All AnalyticsProvider methods must be present for the orchestrator
    it("returns a valid AnalyticsProvider", () => {
      const provider = createYMProvider(12345);
      expect(provider.name).toBe("yandex-metrika");
      expect(typeof provider.init).toBe("function");
      expect(typeof provider.track).toBe("function");
      expect(typeof provider.page).toBe("function");
      expect(typeof provider.identify).toBe("function");
      expect(typeof provider.reset).toBe("function");
      expect(typeof provider.setConsent).toBe("function");
    });
  });

  // ---------------------------------------------------------------------------
  // init
  // ---------------------------------------------------------------------------

  // Verifies YM counter initialization with tracking options
  describe("init", () => {
    // YM init enables clickmap, trackLinks, bounce tracking, and session recording
    it("calls window.ym with init method and counter ID", () => {
      const provider = createYMProvider(98765);
      provider.init();

      expect(window.ym).toHaveBeenCalledWith(
        98765,
        "init",
        expect.objectContaining({
          clickmap: true,
          trackLinks: true,
          accurateTrackBounce: true,
          webvisor: true,
        }),
      );
    });

    // Zero counter ID means YM is not configured — skip initialization
    it("does nothing when counterId is 0", () => {
      const ymSpy = vi.fn();
      (window as unknown as Record<string, unknown>).ym = ymSpy;

      const provider = createYMProvider(0);
      provider.init();

      expect(ymSpy).not.toHaveBeenCalledWith(0, "init", expect.anything());
    });
  });

  // ---------------------------------------------------------------------------
  // track
  // ---------------------------------------------------------------------------

  // Verifies goal tracking via YM's reachGoal method
  describe("track", () => {
    // Events must be blocked until consent is granted
    it("does nothing when consent is not granted", () => {
      const ymSpy = vi.fn();
      (window as unknown as Record<string, unknown>).ym = ymSpy;

      const provider = createYMProvider(111);
      provider.init();
      ymSpy.mockClear();

      provider.track("button_click", { label: "submit" });

      expect(ymSpy).not.toHaveBeenCalled();
    });

    // YM uses reachGoal(counterId, eventName, params) for event tracking
    it("calls reachGoal with event name when consent is granted", () => {
      const ymSpy = vi.fn();
      (window as unknown as Record<string, unknown>).ym = ymSpy;

      const provider = createYMProvider(222);
      provider.init();
      provider.setConsent(true);
      ymSpy.mockClear();

      provider.track("message_sent", { streamId: 5 });

      expect(ymSpy).toHaveBeenCalledWith(222, "reachGoal", "message_sent", { streamId: 5 });
    });

    it("sends empty object when no properties provided", () => {
      const ymSpy = vi.fn();
      (window as unknown as Record<string, unknown>).ym = ymSpy;

      const provider = createYMProvider(333);
      provider.init();
      provider.setConsent(true);
      ymSpy.mockClear();

      provider.track("logout");

      expect(ymSpy).toHaveBeenCalledWith(333, "reachGoal", "logout", {});
    });
  });

  // ---------------------------------------------------------------------------
  // page
  // ---------------------------------------------------------------------------

  // Verifies page view tracking via YM's hit method
  describe("page", () => {
    // Page hits are consent-gated like all other tracking
    it("does nothing when consent is not granted", () => {
      const ymSpy = vi.fn();
      (window as unknown as Record<string, unknown>).ym = ymSpy;

      const provider = createYMProvider(444);
      provider.init();
      ymSpy.mockClear();

      provider.page("/stream/general");

      expect(ymSpy).not.toHaveBeenCalled();
    });

    // YM uses hit(counterId, path, {title}) for SPA page tracking
    it("calls hit with path and title when consent is granted", () => {
      const ymSpy = vi.fn();
      (window as unknown as Record<string, unknown>).ym = ymSpy;

      const provider = createYMProvider(555);
      provider.init();
      provider.setConsent(true);
      ymSpy.mockClear();

      provider.page("/dm/42", "Chat with Bob");

      expect(ymSpy).toHaveBeenCalledWith(555, "hit", "/dm/42", { title: "Chat with Bob" });
    });

    it("falls back to document.title when title is omitted", () => {
      const ymSpy = vi.fn();
      (window as unknown as Record<string, unknown>).ym = ymSpy;

      const provider = createYMProvider(666);
      provider.init();
      provider.setConsent(true);
      ymSpy.mockClear();

      document.title = "Workspace";
      provider.page("/settings");

      expect(ymSpy).toHaveBeenCalledWith(666, "hit", "/settings", { title: "Workspace" });
    });
  });

  // ---------------------------------------------------------------------------
  // identify
  // ---------------------------------------------------------------------------

  // Verifies user identification via YM's userParams method
  describe("identify", () => {
    // User identification is consent-gated
    it("does nothing when consent is not granted", () => {
      const ymSpy = vi.fn();
      (window as unknown as Record<string, unknown>).ym = ymSpy;

      const provider = createYMProvider(777);
      provider.init();
      ymSpy.mockClear();

      provider.identify("user-1", { role: "admin" });

      expect(ymSpy).not.toHaveBeenCalled();
    });

    // YM identifies users via userParams({role, locale}) — no user_id concept
    it("calls userParams with traits when consent is granted", () => {
      const ymSpy = vi.fn();
      (window as unknown as Record<string, unknown>).ym = ymSpy;

      const provider = createYMProvider(888);
      provider.init();
      provider.setConsent(true);
      ymSpy.mockClear();

      provider.identify("user-2", { role: "member", locale: "en" });

      expect(ymSpy).toHaveBeenCalledWith(888, "userParams", { role: "member", locale: "en" });
    });

    // No traits means nothing to send — YM doesn't need a bare user_id
    it("does nothing when traits are not provided", () => {
      const ymSpy = vi.fn();
      (window as unknown as Record<string, unknown>).ym = ymSpy;

      const provider = createYMProvider(999);
      provider.init();
      provider.setConsent(true);
      ymSpy.mockClear();

      provider.identify("user-3");

      expect(ymSpy).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // reset
  // ---------------------------------------------------------------------------

  // YM has no user reset API — this is expected to be a no-op
  describe("reset", () => {
    it("is a no-op (YM does not support user reset)", () => {
      const provider = createYMProvider(1010);
      expect(() => provider.reset()).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // setConsent
  // ---------------------------------------------------------------------------

  // Verifies consent toggling gates all YM API calls
  describe("setConsent", () => {
    // When consent is denied, all tracking methods must be silently blocked
    it("gates tracking — denied prevents track/page/identify", () => {
      const ymSpy = vi.fn();
      (window as unknown as Record<string, unknown>).ym = ymSpy;

      const provider = createYMProvider(2020);
      provider.init();
      provider.setConsent(false);
      ymSpy.mockClear();

      provider.track("event");
      provider.page("/path");
      provider.identify("user", { role: "guest" });

      expect(ymSpy).not.toHaveBeenCalled();
    });

    it("allows tracking after consent is granted", () => {
      const ymSpy = vi.fn();
      (window as unknown as Record<string, unknown>).ym = ymSpy;

      const provider = createYMProvider(3030);
      provider.init();
      provider.setConsent(true);
      ymSpy.mockClear();

      provider.track("test_event");

      expect(ymSpy).toHaveBeenCalled();
    });

    // Consent can be revoked after being granted — must block again
    it("re-gates tracking after consent is revoked", () => {
      const ymSpy = vi.fn();
      (window as unknown as Record<string, unknown>).ym = ymSpy;

      const provider = createYMProvider(4040);
      provider.init();
      provider.setConsent(true);
      ymSpy.mockClear();

      provider.track("allowed");
      expect(ymSpy).toHaveBeenCalledTimes(1);

      provider.setConsent(false);
      ymSpy.mockClear();

      provider.track("blocked");
      expect(ymSpy).not.toHaveBeenCalled();
    });
  });
});
