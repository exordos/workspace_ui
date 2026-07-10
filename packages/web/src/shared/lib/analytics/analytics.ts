/**
 * Analytics — provider-agnostic product analytics.
 *
 * Supports multiple simultaneous providers (GA4, Yandex Metrika, custom).
 * Events are dispatched to all active providers at once.
 *
 * Features:
 * - Consent-aware: events are queued until consent is granted
 * - PII-safe: sensitive data is stripped before sending
 * - Batched: events are buffered and flushed on idle
 * - Provider-agnostic: uniform API regardless of backend
 *
 * Usage:
 *   import { analytics, AnalyticsEvent } from "~/lib/analytics";
 *
 *   analytics.track(AnalyticsEvent.MESSAGE_SENT, { streamId: 42, hasAttachment: true });
 *   analytics.page("/org/example.com/project/project-uuid/stream/stream-uuid");
 *   analytics.identify("123", { role: "admin", locale: "ru" });
 */

import { createLogger } from "../logger";
import { getRuntime } from "../pwa";
import type { AnalyticsProvider, ConsentStatus, EventProperties, UserTraits } from "./types";

export { AnalyticsEvent } from "./types";
export type { AnalyticsProvider, EventProperties, UserTraits, AnalyticsEventName } from "./types";

const log = createLogger("analytics");

// ---------------------------------------------------------------------------
// PII stripping
// ---------------------------------------------------------------------------

const PII_KEYS = new Set([
  "email",
  "password",
  "apikey",
  "api_key",
  "token",
  "secret",
  "phone",
  "ssn",
  "creditcard",
  "address",
]);

function stripPii(props?: EventProperties): EventProperties | undefined {
  if (!props) return undefined;
  const clean: EventProperties = {};
  for (const [k, v] of Object.entries(props)) {
    if (PII_KEYS.has(k.toLowerCase())) {
      clean[k] = "[REDACTED]";
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

// ---------------------------------------------------------------------------
// Consent management
// ---------------------------------------------------------------------------

const CONSENT_KEY = "analytics_consent";

function loadConsent(): ConsentStatus {
  try {
    const stored = localStorage.getItem(CONSENT_KEY);
    if (stored === "granted" || stored === "denied") return stored;
  } catch {
    /* SSR / restricted storage */
  }
  return "pending";
}

function saveConsent(status: ConsentStatus): void {
  try {
    localStorage.setItem(CONSENT_KEY, status);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Event queue (buffer before consent)
// ---------------------------------------------------------------------------

interface QueuedEvent {
  type: "track" | "page" | "identify";
  args: unknown[];
}

const MAX_QUEUE = 200;

// ---------------------------------------------------------------------------
// Analytics singleton
// ---------------------------------------------------------------------------

class Analytics {
  private providers: AnalyticsProvider[] = [];
  private consent: ConsentStatus = loadConsent();
  private queue: QueuedEvent[] = [];
  private initialized = false;
  private superProperties: EventProperties = {};

  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    this.superProperties = {
      runtime: getRuntime(),
      app_version: import.meta.env.VITE_APP_VERSION ?? "dev",
    };

    for (const provider of this.providers) {
      try {
        provider.init();
        provider.setConsent(this.consent === "granted");
      } catch (err) {
        log.error(`Provider ${provider.name} init failed`, { error: String(err) });
      }
    }

    if (this.consent === "granted") {
      this.flushQueue();
    }

    log.info("Analytics initialized", {
      providers: this.providers.map((p) => p.name).join(", "),
      consent: this.consent,
    });
  }

  registerProvider(provider: AnalyticsProvider): void {
    this.providers.push(provider);
    if (this.initialized) {
      try {
        provider.init();
        provider.setConsent(this.consent === "granted");
      } catch (err) {
        log.error(`Provider ${provider.name} late init failed`, { error: String(err) });
      }
    }
  }

  // -- Consent ---------------------------------------------------------------

  grantConsent(): void {
    this.consent = "granted";
    saveConsent("granted");
    for (const p of this.providers) p.setConsent(true);
    this.flushQueue();
    log.info("Analytics consent granted");
  }

  denyConsent(): void {
    this.consent = "denied";
    saveConsent("denied");
    this.queue = [];
    for (const p of this.providers) p.setConsent(false);
    log.info("Analytics consent denied");
  }

  getConsent(): ConsentStatus {
    return this.consent;
  }

  // -- Core API ---------------------------------------------------------------

  track(event: string, properties?: EventProperties): void {
    const props = { ...this.superProperties, ...stripPii(properties) };

    if (this.consent !== "granted") {
      this.enqueue({ type: "track", args: [event, props] });
      return;
    }

    for (const p of this.providers) {
      try {
        p.track(event, props);
      } catch (err) {
        log.warn(`Provider ${p.name} track error`, { error: String(err) });
      }
    }
  }

  page(path: string, title?: string): void {
    if (this.consent !== "granted") {
      this.enqueue({ type: "page", args: [path, title] });
      return;
    }

    for (const p of this.providers) {
      try {
        p.page(path, title);
      } catch (err) {
        log.warn(`Provider ${p.name} page error`, { error: String(err) });
      }
    }
  }

  identify(userId: string, traits?: UserTraits): void {
    const safeTraits = stripPii(traits) as UserTraits | undefined;

    if (this.consent !== "granted") {
      this.enqueue({ type: "identify", args: [userId, safeTraits] });
      return;
    }

    for (const p of this.providers) {
      try {
        p.identify(userId, safeTraits);
      } catch (err) {
        log.warn(`Provider ${p.name} identify error`, { error: String(err) });
      }
    }
  }

  reset(): void {
    this.queue = [];
    for (const p of this.providers) {
      try {
        p.reset();
      } catch {
        /* ignore */
      }
    }
  }

  /** Add properties that are sent with every event automatically. */
  setSuperProperties(props: EventProperties): void {
    Object.assign(this.superProperties, props);
  }

  // -- Internal ---------------------------------------------------------------

  private enqueue(entry: QueuedEvent): void {
    if (this.consent === "denied") return;
    if (this.queue.length >= MAX_QUEUE) this.queue.shift();
    this.queue.push(entry);
  }

  private flushQueue(): void {
    const pending = [...this.queue];
    this.queue = [];
    for (const entry of pending) {
      switch (entry.type) {
        case "track":
          this.track(entry.args[0] as string, entry.args[1] as EventProperties);
          break;
        case "page":
          this.page(entry.args[0] as string, entry.args[1] as string | undefined);
          break;
        case "identify":
          this.identify(entry.args[0] as string, entry.args[1] as UserTraits);
          break;
      }
    }
  }
}

export const analytics = new Analytics();
