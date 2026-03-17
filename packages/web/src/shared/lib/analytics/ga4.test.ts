/**
 * Tests for the Google Analytics 4 (GA4) provider.
 *
 * Verifies gtag.js initialization, dataLayer event pushing, consent management,
 * page view tracking, user identification, and reset. GA4 uses window.dataLayer
 * as a queue — events are pushed as arrays and processed by the gtag.js script.
 * Consent gating ensures no data is sent before the user opts in.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createGA4Provider } from "~/shared/lib/analytics/ga4";

vi.mock("../logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe("ga4", () => {
  let originalDataLayer: unknown[] | undefined;
  let originalGtag: ((...args: unknown[]) => void) | undefined;

  beforeEach(() => {
    originalDataLayer = window.dataLayer;
    originalGtag = window.gtag;
    delete (window as unknown as Record<string, unknown>).dataLayer;
    delete (window as unknown as Record<string, unknown>).gtag;
  });

  afterEach(() => {
    if (originalDataLayer) {
      window.dataLayer = originalDataLayer;
    } else {
      delete (window as unknown as Record<string, unknown>).dataLayer;
    }
    if (originalGtag) {
      window.gtag = originalGtag;
    } else {
      delete (window as unknown as Record<string, unknown>).gtag;
    }
    document.head.querySelectorAll("script[src*='googletagmanager']").forEach((el) => el.remove());
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // createGA4Provider
  // ---------------------------------------------------------------------------

  // Verifies factory function returns a complete provider interface
  describe("createGA4Provider", () => {
    // All AnalyticsProvider methods must be present for the orchestrator
    it("returns a valid AnalyticsProvider", () => {
      const provider = createGA4Provider("G-TEST123");
      expect(provider.name).toBe("ga4");
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

  // Verifies gtag.js initialization: dataLayer, gtag function, script injection
  describe("init", () => {
    // dataLayer is the queue that gtag.js reads from — must exist before events
    it("creates window.dataLayer", () => {
      const provider = createGA4Provider("G-INIT1");
      provider.init();
      expect(window.dataLayer).toBeDefined();
      expect(Array.isArray(window.dataLayer)).toBe(true);
    });

    // gtag() is the API function that pushes events into dataLayer
    it("sets window.gtag function", () => {
      const provider = createGA4Provider("G-INIT2");
      provider.init();
      expect(typeof window.gtag).toBe("function");
    });

    // "js" marks init time, "config" connects the measurement ID
    it("pushes js and config events to dataLayer", () => {
      const provider = createGA4Provider("G-INIT3");
      provider.init();

      expect(window.dataLayer.length).toBeGreaterThanOrEqual(2);

      const jsEntry = window.dataLayer[0] as unknown[];
      expect(jsEntry[0]).toBe("js");
      expect(jsEntry[1]).toBeInstanceOf(Date);

      const configEntry = window.dataLayer[1] as unknown[];
      expect(configEntry[0]).toBe("config");
      expect(configEntry[1]).toBe("G-INIT3");
    });

    // The gtag.js library is loaded asynchronously via script injection
    it("appends a script tag to document.head", () => {
      const appendSpy = vi.spyOn(document.head, "appendChild");
      const provider = createGA4Provider("G-SCRIPT");
      provider.init();

      expect(appendSpy).toHaveBeenCalledTimes(1);
      const script = appendSpy.mock.calls[0]![0] as HTMLScriptElement;
      expect(script.tagName).toBe("SCRIPT");
      expect(script.async).toBe(true);
      expect(script.src).toContain("googletagmanager.com/gtag/js?id=G-SCRIPT");
    });

    // No measurement ID means GA4 is not configured — skip initialization
    it("does nothing when measurementId is empty", () => {
      const appendSpy = vi.spyOn(document.head, "appendChild");
      const provider = createGA4Provider("");
      provider.init();
      expect(appendSpy).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // track
  // ---------------------------------------------------------------------------

  // Verifies event tracking with consent gating
  describe("track", () => {
    // GDPR: events must be blocked until the user explicitly consents
    it("does nothing when consent is not granted", () => {
      const provider = createGA4Provider("G-TRACK1");
      provider.init();
      const before = window.dataLayer.length;

      provider.track("click", { button: "ok" });

      expect(window.dataLayer.length).toBe(before);
    });

    // Events are pushed as ["event", name, properties] tuples to dataLayer
    it("pushes event to dataLayer when consent is granted", () => {
      const provider = createGA4Provider("G-TRACK2");
      provider.init();
      provider.setConsent(true);

      const before = window.dataLayer.length;
      provider.track("message_sent", { streamId: 42 });

      expect(window.dataLayer.length).toBe(before + 1);
      const entry = window.dataLayer[window.dataLayer.length - 1] as unknown[];
      expect(entry[0]).toBe("event");
      expect(entry[1]).toBe("message_sent");
      expect(entry[2]).toEqual({ streamId: 42 });
    });

    it("sends empty object when no properties provided", () => {
      const provider = createGA4Provider("G-TRACK3");
      provider.init();
      provider.setConsent(true);

      provider.track("logout");

      const entry = window.dataLayer[window.dataLayer.length - 1] as unknown[];
      expect(entry[2]).toEqual({});
    });
  });

  // ---------------------------------------------------------------------------
  // page
  // ---------------------------------------------------------------------------

  // Verifies page view tracking via GA4's page_view event
  describe("page", () => {
    // Page views are also consent-gated
    it("does nothing when consent is not granted", () => {
      const provider = createGA4Provider("G-PAGE1");
      provider.init();
      const before = window.dataLayer.length;

      provider.page("/stream/general");

      expect(window.dataLayer.length).toBe(before);
    });

    // GA4 uses a special "page_view" event with page_path and page_title
    it("pushes page_view event when consent is granted", () => {
      const provider = createGA4Provider("G-PAGE2");
      provider.init();
      provider.setConsent(true);

      provider.page("/dm/42", "Chat with Alice");

      const entry = window.dataLayer[window.dataLayer.length - 1] as unknown[];
      expect(entry[0]).toBe("event");
      expect(entry[1]).toBe("page_view");
      expect(entry[2]).toEqual({
        page_path: "/dm/42",
        page_title: "Chat with Alice",
      });
    });

    // Uses document.title as fallback when no explicit title is provided
    it("falls back to document.title when title is omitted", () => {
      const provider = createGA4Provider("G-PAGE3");
      provider.init();
      provider.setConsent(true);

      document.title = "Workspace Messenger";
      provider.page("/settings");

      const entry = window.dataLayer[window.dataLayer.length - 1] as unknown[];
      expect((entry[2] as Record<string, unknown>).page_title).toBe("Workspace Messenger");
    });
  });

  // ---------------------------------------------------------------------------
  // identify
  // ---------------------------------------------------------------------------

  // Verifies user identification via GA4's config and user_properties
  describe("identify", () => {
    // User identification is consent-gated to avoid tracking anonymous users
    it("does nothing when consent is not granted", () => {
      const provider = createGA4Provider("G-ID1");
      provider.init();
      const before = window.dataLayer.length;

      provider.identify("user-123");

      expect(window.dataLayer.length).toBe(before);
    });

    // GA4 links events to a user via the user_id config parameter
    it("sets user_id via config when consent is granted", () => {
      const provider = createGA4Provider("G-ID2");
      provider.init();
      provider.setConsent(true);

      provider.identify("user-456");

      const entry = window.dataLayer[window.dataLayer.length - 1] as unknown[];
      expect(entry[0]).toBe("config");
      expect(entry[1]).toBe("G-ID2");
      expect(entry[2]).toEqual({ user_id: "user-456" });
    });

    // User properties (role, locale) are set separately from user_id
    it("also sets user_properties when traits are provided", () => {
      const provider = createGA4Provider("G-ID3");
      provider.init();
      provider.setConsent(true);

      provider.identify("user-789", { role: "admin", locale: "en" });

      const entries = window.dataLayer.slice(-2);
      const configEntry = entries[0] as unknown[];
      expect(configEntry[0]).toBe("config");
      expect((configEntry[2] as Record<string, unknown>).user_id).toBe("user-789");

      const propsEntry = entries[1] as unknown[];
      expect(propsEntry[0]).toBe("set");
      expect(propsEntry[1]).toBe("user_properties");
      expect(propsEntry[2]).toEqual({ role: "admin", locale: "en" });
    });
  });

  // ---------------------------------------------------------------------------
  // reset
  // ---------------------------------------------------------------------------

  // Verifies cleanup on logout — clears user association
  describe("reset", () => {
    // After logout, user_id and properties must be cleared to prevent leaking
    it("clears user_id and user_properties", () => {
      const provider = createGA4Provider("G-RESET");
      provider.init();
      const before = window.dataLayer.length;

      provider.reset();

      expect(window.dataLayer.length).toBe(before + 2);
      const configEntry = window.dataLayer[before] as unknown[];
      expect(configEntry[0]).toBe("config");
      expect((configEntry[2] as Record<string, unknown>).user_id).toBeUndefined();

      const propsEntry = window.dataLayer[before + 1] as unknown[];
      expect(propsEntry[0]).toBe("set");
      expect(propsEntry[1]).toBe("user_properties");
      expect(propsEntry[2]).toEqual({});
    });
  });

  // ---------------------------------------------------------------------------
  // setConsent
  // ---------------------------------------------------------------------------

  // Verifies GA4 consent mode integration (analytics_storage: granted/denied)
  describe("setConsent", () => {
    // GA4 consent mode controls whether data is collected and stored
    it("pushes consent update to dataLayer with granted", () => {
      const provider = createGA4Provider("G-CONSENT1");
      provider.init();

      provider.setConsent(true);

      const entry = window.dataLayer[window.dataLayer.length - 1] as unknown[];
      expect(entry[0]).toBe("consent");
      expect(entry[1]).toBe("update");
      expect(entry[2]).toEqual({ analytics_storage: "granted" });
    });

    it("pushes consent update to dataLayer with denied", () => {
      const provider = createGA4Provider("G-CONSENT2");
      provider.init();

      provider.setConsent(false);

      const entry = window.dataLayer[window.dataLayer.length - 1] as unknown[];
      expect(entry[0]).toBe("consent");
      expect(entry[1]).toBe("update");
      expect(entry[2]).toEqual({ analytics_storage: "denied" });
    });

    // Consent toggle should gate/un-gate event delivery in real time
    it("enables tracking after consent is granted", () => {
      const provider = createGA4Provider("G-CONSENT3");
      provider.init();

      provider.setConsent(false);
      const before = window.dataLayer.length;
      provider.track("should_be_blocked");
      expect(window.dataLayer.length).toBe(before);

      provider.setConsent(true);
      provider.track("should_go_through", { ok: true });
      expect(window.dataLayer.length).toBeGreaterThan(before);
    });
  });
});
