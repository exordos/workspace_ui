/**
 * Auth session guard — inactivity timeout + secure credential handling.
 *
 * Security measures:
 * - Auto-logout after configurable inactivity period (default: 24h)
 * - Credential wipe on logout (localStorage + Zustand store + client cache)
 * - Single point for auth header construction
 * - Activity tracking (mousemove, keydown, click, scroll, touch)
 *
 * Usage:
 *   import { initAuthGuard } from "~/lib/auth-guard";
 *   initAuthGuard({ onSessionExpired: () => navigate("/login") });
 *
 *   import { buildAuthHeader, wipeCredentials } from "~/lib/auth-guard";
 */

import { Buffer } from "buffer";
import { createLogger, logAction } from "./logger";

const log = createLogger("auth");

type InstanceGetter = () => { email: string; apiKey: string; realm: string } | null;
let instanceGetter: InstanceGetter | null = null;

/** Inject the instance provider to avoid circular dependency with API client. */
export function setAuthInstanceGetter(fn: InstanceGetter): void {
  instanceGetter = fn;
}

function getCurrentInstanceForAuth() {
  return instanceGetter?.() ?? null;
}

// ---------------------------------------------------------------------------
// Store wiper (FSD: injected by app layer to avoid shared→entities import)
// ---------------------------------------------------------------------------

let storeWiper: (() => void) | null = null;

/** Set by the app layer to clear all instance data from stores on logout. */
export function setStoreWiper(fn: () => void): void {
  storeWiper = fn;
}

// ---------------------------------------------------------------------------
// Auth header (single point of construction)
// ---------------------------------------------------------------------------

/** Build Basic auth header from current instance. Returns empty object if not logged in. */
export function buildAuthHeader(): Record<string, string> {
  const value = getBasicAuthValue();
  if (!value) return {};
  return { Authorization: value };
}

/**
 * Returns the full "Basic <base64>" auth string for the current instance,
 * or for explicitly supplied credentials. Returns null if not logged in.
 */
export function getBasicAuthValue(creds?: { email: string; apiKey: string }): string | null {
  const email = creds?.email;
  const apiKey = creds?.apiKey;
  if (email != null && apiKey != null) {
    return `Basic ${Buffer.from(`${email}:${apiKey}`).toString("base64")}`;
  }
  const instance = getCurrentInstanceForAuth();
  if (!instance?.apiKey) return null;
  return `Basic ${Buffer.from(`${instance.email}:${instance.apiKey}`).toString("base64")}`;
}

/** Get raw credentials for SDK init. Returns null if not logged in. */
export function getCredentials(): { realm: string; email: string; apiKey: string } | null {
  const instance = getCurrentInstanceForAuth();
  if (!instance?.apiKey) return null;
  return { realm: instance.realm, email: instance.email, apiKey: instance.apiKey };
}

// ---------------------------------------------------------------------------
// Credential wipe (secure logout)
// ---------------------------------------------------------------------------

/** Wipe all credentials from storage and memory. Call on logout. */
export function wipeCredentials(): void {
  log.info("Wiping all credentials");
  logAction("credentials_wiped");

  const hasInjectedStoreWiper = storeWiper != null;

  try {
    storeWiper?.();
  } catch {
    /* store cleanup is best-effort */
  }

  // When the app layer injects a store wiper, that layer owns persistence semantics
  // (for example, removing only the current instance while preserving other saved orgs).
  // Fallback to direct key removal only when no app-layer cleanup has been provided.
  if (!hasInjectedStoreWiper) {
    try {
      localStorage.removeItem("workspace-runtime-instances");
      localStorage.removeItem("workspace-runtime-current-instance");
    } catch {
      /* localStorage may not be available */
    }
  }
}

// ---------------------------------------------------------------------------
// Session timeout (inactivity auto-logout)
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 24 * 60 * 60 * 1000;

interface AuthGuardOptions {
  timeoutMs?: number;
  onBeforeSessionExpired?: () => Promise<void> | void;
  onSessionExpired: () => void;
}

let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
let initialized = false;
let sessionExpiresAtMs = 0;

function isDocumentHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

function isPromiseLike(value: unknown): value is PromiseLike<void> {
  return typeof value === "object" && value !== null && "then" in value;
}

function fireSessionExpired(
  timeoutMs: number,
  onExpired: () => void,
  onBeforeExpired?: () => Promise<void> | void,
): void {
  log.warn("Session expired due to inactivity", { timeoutMs });
  logAction("session_expired", { timeoutMs });
  if (onBeforeExpired == null) {
    wipeCredentials();
    onExpired();
    return;
  }

  let beforeResult: Promise<void> | void;
  try {
    beforeResult = onBeforeExpired();
  } catch (err) {
    log.warn("Pre-expiry hook failed", { error: String(err) });
    wipeCredentials();
    onExpired();
    return;
  }

  if (!isPromiseLike(beforeResult)) {
    wipeCredentials();
    onExpired();
    return;
  }

  void Promise.resolve(beforeResult)
    .catch((err) => {
      log.warn("Pre-expiry hook failed", { error: String(err) });
    })
    .finally(() => {
      wipeCredentials();
      onExpired();
    });
}

function scheduleSessionExpiryTimer(
  timeoutMs: number,
  onExpired: () => void,
  onBeforeExpired?: () => Promise<void> | void,
): void {
  if (timeoutTimer) clearTimeout(timeoutTimer);
  timeoutTimer = null;

  if (isDocumentHidden()) {
    return;
  }

  const remainingMs = sessionExpiresAtMs - Date.now();
  if (remainingMs <= 0) {
    fireSessionExpired(timeoutMs, onExpired, onBeforeExpired);
    return;
  }

  timeoutTimer = setTimeout(() => {
    fireSessionExpired(timeoutMs, onExpired, onBeforeExpired);
  }, remainingMs);
}

function resetTimer(
  timeoutMs: number,
  onExpired: () => void,
  onBeforeExpired?: () => Promise<void> | void,
): void {
  sessionExpiresAtMs = Date.now() + timeoutMs;
  scheduleSessionExpiryTimer(timeoutMs, onExpired, onBeforeExpired);
}

function handleVisibilityChange(
  timeoutMs: number,
  onExpired: () => void,
  onBeforeExpired?: () => Promise<void> | void,
): void {
  if (!isDocumentHidden()) {
    scheduleSessionExpiryTimer(timeoutMs, onExpired, onBeforeExpired);
  } else if (timeoutTimer) {
    clearTimeout(timeoutTimer);
    timeoutTimer = null;
  }
}

/** Read-only session expiry timestamp (ms since epoch), or null when guard is inactive. */
export function getSessionExpiresAtMs(): number | null {
  if (!initialized || sessionExpiresAtMs <= 0) return null;
  return sessionExpiresAtMs;
}

/** Milliseconds until inactivity logout, or null when guard is inactive. */
export function getSessionRemainingMs(): number | null {
  const expiresAtMs = getSessionExpiresAtMs();
  if (expiresAtMs == null) return null;
  return Math.max(0, expiresAtMs - Date.now());
}

export function initAuthGuard(options: AuthGuardOptions): () => void {
  if (typeof window === "undefined") return () => {};
  if (initialized) return () => {};
  initialized = true;

  const { timeoutMs = DEFAULT_TIMEOUT_MS, onSessionExpired, onBeforeSessionExpired } = options;

  const hasInstances = getCurrentInstanceForAuth() != null;
  if (!hasInstances) return () => {};

  const ACTIVITY_EVENTS = ["mousemove", "keydown", "click", "scroll", "touchstart"];

  const handleActivity = () => resetTimer(timeoutMs, onSessionExpired, onBeforeSessionExpired);

  const handleVisibility = () =>
    handleVisibilityChange(timeoutMs, onSessionExpired, onBeforeSessionExpired);

  for (const event of ACTIVITY_EVENTS) {
    window.addEventListener(event, handleActivity, { passive: true });
  }
  document.addEventListener("visibilitychange", handleVisibility);

  resetTimer(timeoutMs, onSessionExpired, onBeforeSessionExpired);

  log.info("Auth guard initialized", { timeoutMs });

  return () => {
    initialized = false;
    if (timeoutTimer) clearTimeout(timeoutTimer);
    for (const event of ACTIVITY_EVENTS) {
      window.removeEventListener(event, handleActivity);
    }
    document.removeEventListener("visibilitychange", handleVisibility);
  };
}
