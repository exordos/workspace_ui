/**
 * Push notification system — manages FCM + Zulip server registration.
 *
 * Flow:
 * 1. User grants notification permission
 * 2. FCM provider acquires push token from Firebase
 * 3. Token is registered with Zulip server via API
 * 4. Zulip server sends push notifications → FCM → Service Worker → app
 * 5. Foreground: onMessage handler shows in-app notification
 * 6. Background: Service Worker shows system notification
 *
 * Usage:
 *   import { pushService } from "~/shared/lib/push/push.service";
 *
 *   await pushService.requestPermission();
 *   await pushService.register();
 *   pushService.onMessage((payload) => { ... });
 */

import { useSyncExternalStore } from "react";
import { analytics, AnalyticsEvent } from "../analytics/analytics";
import { isElectron } from "../electron";
import { createLogger, logAction } from "../logger";
import { createFcmProvider } from "./fcm";
import { installDefaultMiddlewares } from "./middleware";
import { registerPushTokenWithRetry } from "./push-register-retry.lib";
import { registerPushToken, unregisterPushToken } from "./zulip";
import type { PushMessagePayload, PushProvider, PushState, PushPermission } from "./types";

export type { PushMessagePayload, PushState, PushPermission } from "./types";
export { pushPipeline } from "./middleware";
export type { PushMiddleware, RawPushEnvelope, PushMiddlewareContext } from "./middleware";

const log = createLogger("push");

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const TOKEN_KEY = "push_token";

let state: PushState = {
  permission: "default",
  token: null,
  registered: false,
  provider: null,
  registrationError: null,
};

const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((cb) => cb());
}

function setState(patch: Partial<PushState>): void {
  state = { ...state, ...patch };
  notify();
}

let provider: PushProvider | null = null;
let registerInFlight: Promise<boolean> | null = null;

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

function getPermission(): PushPermission {
  if (isElectron()) return "granted";
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

async function requestPermission(): Promise<PushPermission> {
  if (isElectron()) return "granted";
  if (!("Notification" in window)) return "unsupported";

  const result = await Notification.requestPermission();
  const perm = result as PushPermission;
  setState({ permission: perm });

  if (perm === "granted") {
    analytics.track(AnalyticsEvent.NOTIFICATION_ALLOWED);
  } else if (perm === "denied") {
    analytics.track(AnalyticsEvent.NOTIFICATION_DENIED);
  }

  return perm;
}

async function performRegister(): Promise<boolean> {
  if (!provider) {
    log.info("Push provider unavailable, skipping registration");
    return false;
  }

  const permission = getPermission();
  if (permission !== "granted") {
    log.info("Push permission not granted", { permission });
    return false;
  }

  setState({ registrationError: null });

  try {
    await provider.init();

    const token = await provider.getToken();
    if (!token) {
      const error = "Failed to acquire push token";
      log.warn(error);
      setState({ registrationError: error, registered: false });
      return false;
    }

    const oldToken = loadStoredToken();
    if (oldToken && oldToken !== token) {
      await unregisterPushToken(oldToken);
    }

    const { ok, lastError } = await registerPushTokenWithRetry(registerPushToken, token);
    if (ok) {
      storeToken(token);
      setState({ token, registered: true, provider: provider.name, registrationError: null });
      log.info("Push notifications registered", { provider: provider.name });
      logAction("push_register", {
        provider: provider.name,
        tokenPrefix: `${token.slice(0, 8)}…`,
      });
      return true;
    }

    setState({ registered: false, registrationError: lastError });
    return false;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("Push registration failed", { error: message });
    setState({ registered: false, registrationError: message });
    return false;
  }
}

async function register(): Promise<boolean> {
  if (registerInFlight) {
    return registerInFlight;
  }
  registerInFlight = performRegister().finally(() => {
    registerInFlight = null;
  });
  return registerInFlight;
}

async function unregister(): Promise<void> {
  const token = state.token ?? loadStoredToken();
  if (token) {
    await unregisterPushToken(token);
    clearStoredToken();
  }
  setState({ token: null, registered: false, registrationError: null });
  log.info("Push notifications unregistered");
  if (token) {
    logAction("push_unregister", { tokenPrefix: `${token.slice(0, 8)}…` });
  }
}

function onMessage(handler: (payload: PushMessagePayload) => void): () => void {
  if (!provider) return () => {};
  return provider.onMessage(handler);
}

function isSupported(): boolean {
  if (isElectron()) return true;
  return provider?.isSupported() ?? false;
}

// ---------------------------------------------------------------------------
// Token persistence
// ---------------------------------------------------------------------------

function loadStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function storeToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

function clearStoredToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

export function usePushState(): PushState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

export function initPush(): void {
  installDefaultMiddlewares();

  if (isElectron()) {
    setState({ permission: "granted", provider: "electron" });
    return;
  }

  if (typeof window === "undefined") return;

  const fcm = createFcmProvider();
  if (fcm.isSupported()) {
    provider = fcm;
    setState({ permission: getPermission(), provider: "fcm" });
    log.info("FCM push provider activated");
  } else {
    setState({ permission: getPermission(), provider: null });
    log.info("Push not supported in this environment");
  }
}

// ---------------------------------------------------------------------------
// Public service object
// ---------------------------------------------------------------------------

export const pushService = {
  requestPermission,
  register,
  unregister,
  onMessage,
  isSupported,
  getPermission,
  getState: () => state,
};
