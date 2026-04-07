/**
 * Tests for the analytics orchestrator (analytics singleton).
 *
 * Verifies the central analytics API: event taxonomy, multi-provider dispatch,
 * consent management (pending → granted/denied), PII stripping, super properties,
 * event queuing, and reset. This is the abstraction that shields the app from
 * specific analytics vendors (GA4, YM) and ensures GDPR compliance through
 * consent-gated event delivery.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalyticsProvider, EventProperties, UserTraits } from "~/shared/lib/analytics/types";
import { analytics, AnalyticsEvent } from "./analytics";

function createMockProvider(name = "mock"): AnalyticsProvider & {
  trackCalls: { event: string; properties?: EventProperties }[];
  pageCalls: { path: string; title?: string }[];
  identifyCalls: { userId: string; traits?: UserTraits }[];
  resetCalls: number;
  consentState: boolean;
} {
  const provider = {
    name,
    trackCalls: [] as { event: string; properties?: EventProperties }[],
    pageCalls: [] as { path: string; title?: string }[],
    identifyCalls: [] as { userId: string; traits?: UserTraits }[],
    resetCalls: 0,
    consentState: false,
    init: vi.fn(),
    track(event: string, properties?: EventProperties) {
      provider.trackCalls.push({ event, properties });
    },
    page(path: string, title?: string) {
      provider.pageCalls.push({ path, title });
    },
    identify(userId: string, traits?: UserTraits) {
      provider.identifyCalls.push({ userId, traits });
    },
    reset() {
      provider.resetCalls++;
    },
    setConsent(granted: boolean) {
      provider.consentState = granted;
    },
  };
  return provider;
}

// Core analytics singleton behavior and event taxonomy validation
describe("Analytics", () => {
  beforeEach(() => {
    // eslint-disable-next-line no-restricted-properties -- test teardown, no credentials stored
    localStorage.clear();
  });

  afterEach(() => {
    analytics.reset();
  });

  // Event names must be stable strings since they become GA4/YM event identifiers
  it("AnalyticsEvent constants are strings", () => {
    expect(typeof AnalyticsEvent.MESSAGE_SENT).toBe("string");
    expect(AnalyticsEvent.MESSAGE_SENT).toBe("message_sent");
    expect(AnalyticsEvent.LOGIN).toBe("login");
    expect(AnalyticsEvent.STREAM_OPENED).toBe("stream_opened");
  });

  // The singleton must expose the full API for the app to use
  it("analytics singleton is defined", () => {
    expect(analytics).toBeDefined();
    expect(typeof analytics.track).toBe("function");
    expect(typeof analytics.page).toBe("function");
    expect(typeof analytics.identify).toBe("function");
    expect(typeof analytics.reset).toBe("function");
    expect(typeof analytics.grantConsent).toBe("function");
    expect(typeof analytics.denyConsent).toBe("function");
    expect(typeof analytics.getConsent).toBe("function");
  });

  // No providers registered yet — must not crash (graceful degradation)
  it("track does not throw without providers", () => {
    expect(() => analytics.track("test_event", { key: "value" })).not.toThrow();
  });

  it("page does not throw without providers", () => {
    expect(() => analytics.page("/test")).not.toThrow();
  });

  // GDPR: consent must be explicitly granted before any data is sent
  it("consent is pending by default", () => {
    expect(analytics.getConsent()).toBe("pending");
  });

  it("grantConsent changes consent status", () => {
    analytics.grantConsent();
    expect(analytics.getConsent()).toBe("granted");
  });

  it("denyConsent changes consent status", () => {
    analytics.denyConsent();
    expect(analytics.getConsent()).toBe("denied");
  });

  it("event taxonomy has all required categories", () => {
    expect(AnalyticsEvent.LOGIN).toBeDefined();
    expect(AnalyticsEvent.MESSAGE_SENT).toBeDefined();
    expect(AnalyticsEvent.STREAM_OPENED).toBeDefined();
    expect(AnalyticsEvent.CALL_STARTED).toBeDefined();
    expect(AnalyticsEvent.SIDEBAR_TOGGLED).toBeDefined();
    expect(AnalyticsEvent.PWA_INSTALLED).toBeDefined();
    expect(AnalyticsEvent.SESSION_START).toBeDefined();
    expect(AnalyticsEvent.FEATURE_ERROR).toBeDefined();
  });

  it("setSuperProperties does not throw", () => {
    expect(() => analytics.setSuperProperties({ plan: "enterprise" })).not.toThrow();
  });
});

// Ensures every event category has all required event names defined
describe("AnalyticsEvent taxonomy completeness", () => {
  // Auth events track the login/logout funnel
  it("has auth events", () => {
    expect(AnalyticsEvent.LOGIN).toBe("login");
    expect(AnalyticsEvent.LOGOUT).toBe("logout");
    expect(AnalyticsEvent.SIGNUP).toBe("signup");
  });

  // Messaging events are the core engagement metrics
  it("has messaging events", () => {
    expect(AnalyticsEvent.MESSAGE_SENT).toBe("message_sent");
    expect(AnalyticsEvent.MESSAGE_EDITED).toBe("message_edited");
    expect(AnalyticsEvent.MESSAGE_DELETED).toBe("message_deleted");
    expect(AnalyticsEvent.MESSAGE_REACTION).toBe("message_reaction");
  });

  // Navigation events reveal which features users actually visit
  it("has navigation events", () => {
    expect(AnalyticsEvent.STREAM_OPENED).toBe("stream_opened");
    expect(AnalyticsEvent.TOPIC_OPENED).toBe("topic_opened");
    expect(AnalyticsEvent.DM_OPENED).toBe("dm_opened");
    expect(AnalyticsEvent.SEARCH_PERFORMED).toBe("search_performed");
  });

  // Engagement events measure session duration and app health
  it("has engagement events", () => {
    expect(AnalyticsEvent.SESSION_START).toBe("session_start");
    expect(AnalyticsEvent.SESSION_END).toBe("session_end");
    expect(AnalyticsEvent.APP_FOREGROUNDED).toBe("app_foregrounded");
    expect(AnalyticsEvent.NETWORK_RECONNECTED).toBe("network_reconnected");
  });
});

// ---------------------------------------------------------------------------
// PII stripping
// ---------------------------------------------------------------------------

// Verifies that sensitive data is automatically redacted before reaching providers
describe("Analytics PII stripping", () => {
  const provider = createMockProvider("pii-provider");

  beforeAll(() => {
    analytics.registerProvider(provider);
    analytics.grantConsent();
  });

  beforeEach(() => {
    provider.trackCalls = [];
    provider.identifyCalls = [];
  });

  afterEach(() => {
    analytics.reset();
  });

  // Email is PII — must never reach third-party analytics
  it("redacts email in track properties", () => {
    analytics.track("evt", { email: "user@example.com", safe: "ok" });
    const props = provider.trackCalls[0]?.properties;
    expect(props?.email).toBe("[REDACTED]");
    expect(props?.safe).toBe("ok");
  });

  it("redacts password in track properties", () => {
    analytics.track("evt", { password: "pw" });
    expect(provider.trackCalls[0]?.properties?.password).toBe("[REDACTED]");
  });

  it("redacts token in track properties", () => {
    analytics.track("evt", { token: "tok" });
    expect(provider.trackCalls[0]?.properties?.token).toBe("[REDACTED]");
  });

  it("redacts apikey (case-insensitive) in track properties", () => {
    analytics.track("evt", { apiKey: "key", API_KEY: "key2" });
    const props = provider.trackCalls[0]?.properties;
    expect(props?.apiKey).toBe("[REDACTED]");
    expect(props?.API_KEY).toBe("[REDACTED]");
  });

  it("redacts secret, phone, ssn, creditcard, address", () => {
    analytics.track("evt", {
      secret: "s",
      phone: "p",
      ssn: "n",
      creditcard: "c",
      address: "a",
    });
    const props = provider.trackCalls[0]?.properties;
    expect(props?.secret).toBe("[REDACTED]");
    expect(props?.phone).toBe("[REDACTED]");
    expect(props?.ssn).toBe("[REDACTED]");
    expect(props?.creditcard).toBe("[REDACTED]");
    expect(props?.address).toBe("[REDACTED]");
  });

  // Non-sensitive properties must pass through for proper analytics
  it("passes through non-PII properties untouched", () => {
    analytics.track("evt", { streamId: 42, hasAttachment: true });
    const props = provider.trackCalls[0]?.properties;
    expect(props?.streamId).toBe(42);
    expect(props?.hasAttachment).toBe(true);
  });

  // PII stripping also applies to user traits, not just event properties
  it("redacts PII in identify traits", () => {
    analytics.identify("user-1", { email: "a@b.com", role: "admin" } as UserTraits);
    const traits = provider.identifyCalls[0]?.traits;
    expect(traits?.email).toBe("[REDACTED]");
    expect(traits?.role).toBe("admin");
  });

  it("handles undefined properties", () => {
    analytics.track("evt");
    expect(provider.trackCalls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Consent flow
// ---------------------------------------------------------------------------

// Verifies GDPR-compliant consent flow: pending → granted/denied with event queuing
describe("Analytics consent flow", () => {
  const provider = createMockProvider("consent-provider");

  beforeAll(() => {
    analytics.registerProvider(provider);
  });

  beforeEach(() => {
    provider.trackCalls = [];
    provider.pageCalls = [];
    provider.identifyCalls = [];
  });

  afterEach(() => {
    analytics.reset();
  });

  // Events before consent are queued, not dropped — they flush when user consents
  it("queues track events while pending, flushes on grant", () => {
    // Force pending consent via private field (no public API to reset to pending)
    (analytics as unknown as Record<string, unknown>).consent = "pending";

    analytics.track("queued_event", { key: "val" });
    expect(provider.trackCalls).toHaveLength(0);

    analytics.grantConsent();
    expect(provider.trackCalls.length).toBeGreaterThanOrEqual(1);
    const flushed = provider.trackCalls.find((c) => c.event === "queued_event");
    expect(flushed).toBeDefined();
  });

  it("queues page events while pending, flushes on grant", () => {
    (analytics as unknown as Record<string, unknown>).consent = "pending";

    analytics.page("/queued-page", "Title");
    expect(provider.pageCalls).toHaveLength(0);

    analytics.grantConsent();
    const flushed = provider.pageCalls.find((c) => c.path === "/queued-page");
    expect(flushed).toBeDefined();
    expect(flushed?.title).toBe("Title");
  });

  it("queues identify events while pending, flushes on grant", () => {
    (analytics as unknown as Record<string, unknown>).consent = "pending";

    analytics.identify("u-1", { role: "member" });
    expect(provider.identifyCalls).toHaveLength(0);

    analytics.grantConsent();
    const flushed = provider.identifyCalls.find((c) => c.userId === "u-1");
    expect(flushed).toBeDefined();
  });

  // Denying consent must clear the queue AND block all future events
  it("deny clears the queue and drops subsequent events", () => {
    (analytics as unknown as Record<string, unknown>).consent = "pending";

    analytics.track("will_be_dropped");
    analytics.denyConsent();
    expect(provider.trackCalls).toHaveLength(0);

    analytics.track("after_deny");
    expect(provider.trackCalls).toHaveLength(0);
  });

  // Consent choice persists across page reloads via localStorage
  it("persists granted consent to localStorage", () => {
    analytics.grantConsent();
    expect(localStorage.getItem("analytics_consent")).toBe("granted");
  });

  it("persists denied consent to localStorage", () => {
    analytics.denyConsent();
    expect(localStorage.getItem("analytics_consent")).toBe("denied");
  });

  it("setConsent(true) called on providers when granting", () => {
    analytics.grantConsent();
    expect(provider.consentState).toBe(true);
  });

  it("setConsent(false) called on providers when denying", () => {
    analytics.denyConsent();
    expect(provider.consentState).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Multiple providers
// ---------------------------------------------------------------------------

// Verifies that events are dispatched to ALL registered providers (fan-out)
describe("Analytics multiple providers", () => {
  const providerA = createMockProvider("multi-a");
  const providerB = createMockProvider("multi-b");

  beforeAll(() => {
    analytics.registerProvider(providerA);
    analytics.registerProvider(providerB);
    analytics.grantConsent();
  });

  beforeEach(() => {
    providerA.trackCalls = [];
    providerA.pageCalls = [];
    providerA.identifyCalls = [];
    providerB.trackCalls = [];
    providerB.pageCalls = [];
    providerB.identifyCalls = [];
  });

  afterEach(() => {
    analytics.reset();
  });

  // Both GA4 and YM (or any other) should receive every event
  it("track dispatches to all providers", () => {
    analytics.track("multi_evt", { x: 1 });
    expect(providerA.trackCalls.find((c) => c.event === "multi_evt")).toBeDefined();
    expect(providerB.trackCalls.find((c) => c.event === "multi_evt")).toBeDefined();
  });

  it("page dispatches to all providers", () => {
    analytics.page("/multi");
    expect(providerA.pageCalls.find((c) => c.path === "/multi")).toBeDefined();
    expect(providerB.pageCalls.find((c) => c.path === "/multi")).toBeDefined();
  });

  it("identify dispatches to all providers", () => {
    analytics.identify("u-multi", { role: "admin" });
    expect(providerA.identifyCalls.find((c) => c.userId === "u-multi")).toBeDefined();
    expect(providerB.identifyCalls.find((c) => c.userId === "u-multi")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Register provider late (after init)
// ---------------------------------------------------------------------------

// Verifies that providers added after init() are properly initialized
describe("Analytics registerProvider after init", () => {
  afterEach(() => {
    analytics.reset();
  });

  // Late providers must be caught up with the current init + consent state
  it("late-registered provider gets init + setConsent immediately", () => {
    analytics.init();
    analytics.grantConsent();

    const lateProvider = createMockProvider("late");
    analytics.registerProvider(lateProvider);

    expect(lateProvider.init).toHaveBeenCalledOnce();
    expect(lateProvider.consentState).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// setSuperProperties
// ---------------------------------------------------------------------------

// Verifies super properties that are automatically merged into every event
describe("Analytics setSuperProperties", () => {
  const provider = createMockProvider("super-props");

  beforeAll(() => {
    analytics.registerProvider(provider);
    analytics.grantConsent();
  });

  beforeEach(() => {
    provider.trackCalls = [];
  });

  afterEach(() => {
    analytics.reset();
  });

  // Super props (plan, org) are auto-added so callers don't repeat them
  it("super properties are merged into every track call", () => {
    analytics.setSuperProperties({ plan: "enterprise", org: "acme" });
    analytics.track("evt", { streamId: 1 });
    const props = provider.trackCalls.find((c) => c.event === "evt")?.properties;
    expect(props?.plan).toBe("enterprise");
    expect(props?.org).toBe("acme");
    expect(props?.streamId).toBe(1);
  });

  // Explicit event props take precedence over super props (specificity wins)
  it("event properties override super properties", () => {
    analytics.setSuperProperties({ plan: "free" });
    analytics.track("evt", { plan: "pro" });
    const props = provider.trackCalls.find((c) => c.event === "evt")?.properties;
    expect(props?.plan).toBe("pro");
  });
});

// ---------------------------------------------------------------------------
// reset
// ---------------------------------------------------------------------------

// Verifies cleanup on logout — providers reset and queued events are cleared
describe("Analytics reset", () => {
  const provider = createMockProvider("reset-prov");

  beforeAll(() => {
    analytics.registerProvider(provider);
    analytics.grantConsent();
  });

  // Each provider must be notified to clear user_id and traits
  it("reset calls provider.reset()", () => {
    const before = provider.resetCalls;
    analytics.reset();
    expect(provider.resetCalls).toBe(before + 1);
  });

  // Pending queued events from a previous session must not leak to the next user
  it("reset clears the event queue", () => {
    (analytics as unknown as Record<string, unknown>).consent = "pending";
    analytics.track("queued");

    provider.trackCalls = [];
    analytics.reset();

    analytics.grantConsent();
    const flushed = provider.trackCalls.find((c) => c.event === "queued");
    expect(flushed).toBeUndefined();
  });
});
