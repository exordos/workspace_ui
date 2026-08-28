/**
 * Presence tracker — measures whether the local user is at the keyboard.
 *
 * Detects user activity (mouse, keyboard, touch, scroll) and derives a status
 * from it and from tab visibility.
 *
 * States:
 *   active  — user is interacting with the app right now
 *   idle    — no interaction for IDLE_TIMEOUT_MS, or the tab just went hidden
 *   offline — tab hidden for OFFLINE_DELAY_MS
 *
 * The module integrates with visibility tracking: hidden tab → idle → offline.
 *
 * This module only measures. Sending presence to the server belongs to the
 * heartbeat in `entities/user/user-workspace-presence-reporter.lib.ts`, which
 * subscribes through `onLocalPresenceChange` and decides what may be claimed —
 * a measured status must never overwrite one the user deliberately chose.
 *
 * Usage:
 *   import { initPresenceTracker, getLocalPresenceStatus } from "~/shared/lib/presence";
 *
 *   initPresenceTracker(); // call once at startup
 *   const status = getLocalPresenceStatus(); // "active" | "idle" | "offline"
 */

import { useSyncExternalStore } from "react";
import { createLogger } from "./logger";
import { isTabVisible, onVisibilityChange } from "./visibility";

const log = createLogger("presence");

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const OFFLINE_DELAY_MS = 5 * 60 * 1000;
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
  "pointerdown",
];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type LocalPresenceStatus = "active" | "idle" | "offline";

let currentStatus: LocalPresenceStatus = "active";
let lastActivityAt = Date.now();
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let offlineTimer: ReturnType<typeof setTimeout> | null = null;
let initialized = false;

const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((cb) => cb());
}

function setStatus(next: LocalPresenceStatus): void {
  if (currentStatus === next) return;
  const prev = currentStatus;
  currentStatus = next;
  log.info("Presence changed", { from: prev, to: next });
  notify();
}

// ---------------------------------------------------------------------------
// Activity detection
// ---------------------------------------------------------------------------

function onActivity(): void {
  lastActivityAt = Date.now();

  if (currentStatus !== "active") {
    setStatus("active");
  }

  resetIdleTimer();
}

function resetIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (isTabVisible()) {
      setStatus("idle");
    }
  }, IDLE_TIMEOUT_MS);
}

function clearOfflineTimer(): void {
  if (offlineTimer) {
    clearTimeout(offlineTimer);
    offlineTimer = null;
  }
}

function onVisibilityToggle(visible: boolean): void {
  if (visible) {
    clearOfflineTimer();
    lastActivityAt = Date.now();
    setStatus("active");
    resetIdleTimer();
    return;
  }

  setStatus("idle");
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  offlineTimer = setTimeout(() => setStatus("offline"), OFFLINE_DELAY_MS);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getLocalPresenceStatus(): LocalPresenceStatus {
  return currentStatus;
}

export function getLastActivityTimestamp(): number {
  return lastActivityAt;
}

export function getIdleTimeMs(): number {
  return Date.now() - lastActivityAt;
}

/**
 * React hook — returns reactive local presence status.
 */
export function useLocalPresence(): LocalPresenceStatus {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => currentStatus,
  );
}

/**
 * Subscribe to local presence transitions. Fires only on an actual change, so the
 * heartbeat can report a status change without waiting for its next interval.
 */
export function onLocalPresenceChange(callback: (status: LocalPresenceStatus) => void): () => void {
  const listener = () => callback(currentStatus);
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Initialize the presence tracker. Call once at app startup.
 */
export function initPresenceTracker(): () => void {
  if (initialized) return () => {};
  initialized = true;

  lastActivityAt = Date.now();
  setStatus(isTabVisible() ? "active" : "idle");

  const handler = () => onActivity();
  for (const event of ACTIVITY_EVENTS) {
    window.addEventListener(event, handler, { passive: true, capture: true });
  }

  const unsubVisibility = onVisibilityChange(onVisibilityToggle);
  resetIdleTimer();

  log.info("Presence tracker initialized", { idleTimeoutMs: IDLE_TIMEOUT_MS });

  return () => {
    initialized = false;
    for (const event of ACTIVITY_EVENTS) {
      window.removeEventListener(event, handler, { capture: true });
    }
    unsubVisibility();
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    clearOfflineTimer();
  };
}
