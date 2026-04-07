/**
 * Sentry integration — error tracking and performance monitoring.
 *
 * Activated only when VITE_SENTRY_DSN is set.
 * In dev mode: disabled by default (set VITE_SENTRY_DEV=1 to override).
 *
 * Security: PII stripping, credential redaction, user data anonymization.
 *
 * Usage:
 *   - Auto-initialized in main.tsx (import "~/lib/sentry")
 *   - Errors from ErrorBoundary and unhandled rejections are captured automatically
 *   - Logger transport sends error-level entries to Sentry as breadcrumbs
 *   - Manual capture: captureException(), captureMessage()
 */

import * as Sentry from "@sentry/react";
import { env } from "./env";
import { addTransport } from "./logger";
import { getRuntime } from "./pwa";
import type { LogEntry, LogTransport } from "./logger";

const DSN = env.DEV ? "" : (import.meta.env.VITE_SENTRY_DSN ?? "");
const ENABLED = DSN.length > 0;

export function initSentry(): void {
  if (!ENABLED) return;

  Sentry.init({
    dsn: DSN,
    environment: env.MODE,
    release: `workspace@${import.meta.env.VITE_APP_VERSION ?? "0.0.0"}`,

    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: true,
      }),
    ],

    tracesSampleRate: env.PROD ? 0.1 : 1.0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: env.PROD ? 1.0 : 0,

    beforeSend(event) {
      return stripSensitiveData(event);
    },

    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === "xhr" || breadcrumb.category === "fetch") {
        if (breadcrumb.data?.url) {
          breadcrumb.data.url = redactUrl(breadcrumb.data.url as string);
        }
      }
      return breadcrumb;
    },

    ignoreErrors: [
      "ResizeObserver loop",
      "Non-Error promise rejection",
      "Load failed",
      "Failed to fetch",
      "NetworkError",
      "AbortError",
      "The operation was aborted",
    ],

    denyUrls: [/extensions\//i, /^chrome:\/\//i, /^chrome-extension:\/\//i, /^moz-extension:\/\//i],
  });

  Sentry.setTag("runtime", getRuntime());

  registerLoggerTransport();
}

function stripSensitiveData(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  if (event.request?.headers) {
    delete event.request.headers.Authorization;
    delete event.request.headers.Cookie;
  }

  if (event.request?.cookies) {
    event.request.cookies = {};
  }

  if (event.extra) {
    for (const key of Object.keys(event.extra)) {
      const lower = key.toLowerCase();
      if (
        lower.includes("apikey") ||
        lower.includes("password") ||
        lower.includes("token") ||
        lower.includes("secret") ||
        lower.includes("authorization")
      ) {
        event.extra[key] = "[REDACTED]";
      }
    }
  }

  return event;
}

function redactUrl(url: string): string {
  try {
    const parsed = new URL(url, window.location.origin);
    parsed.searchParams.forEach((_, key) => {
      const lower = key.toLowerCase();
      if (lower.includes("key") || lower.includes("token") || lower.includes("secret")) {
        parsed.searchParams.set(key, "[REDACTED]");
      }
    });
    return parsed.toString();
  } catch {
    return url;
  }
}

function registerLoggerTransport(): void {
  const sentryTransport: LogTransport = {
    write(entry: LogEntry) {
      if (entry.level === "error") {
        Sentry.addBreadcrumb({
          category: entry.scope,
          message: entry.message,
          level: "error",
          data: entry.data as Record<string, string>,
        });
      } else if (entry.level === "warn") {
        Sentry.addBreadcrumb({
          category: entry.scope,
          message: entry.message,
          level: "warning",
        });
      }
    },
  };

  addTransport(sentryTransport);
}

export function setUser(id: number, _email?: string): void {
  if (!ENABLED) return;
  Sentry.setUser({ id: String(id) });
}

export function clearUser(): void {
  if (!ENABLED) return;
  Sentry.setUser(null);
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!ENABLED) return;
  Sentry.captureException(error, { extra: context });
}

export function captureMessage(message: string, level: Sentry.SeverityLevel = "info"): void {
  if (!ENABLED) return;
  Sentry.captureMessage(message, level);
}

export { ENABLED as sentryEnabled };
