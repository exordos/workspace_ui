/**
 * Presence tracker — reports local user activity to the Zulip server.
 *
 * Detects user activity (mouse, keyboard, touch, scroll) and reports
 * presence status to the server via POST /users/me/presence.
 *
 * States:
 *   active  — user is interacting with the app right now
 *   idle    — no interaction for IDLE_TIMEOUT_MS (default 5 min)
 *   offline — tab hidden for > OFFLINE_DELAY_MS or browser closed
 *
 * The module integrates with visibility tracking: hidden tab → idle → offline.
 * On tab resume, presence is immediately reported as "active".
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
const REPORT_INTERVAL_MS = 60 * 1000;
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
let reportInterval: ReturnType<typeof setInterval> | null = null;
let initialized = false;
let reportFn: ((status: "active" | "idle") => void) | null = null;

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

  if (next !== "offline" && reportFn) {
    reportFn(next);
  }
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

function onVisibilityToggle(visible: boolean): void {
  if (visible) {
    lastActivityAt = Date.now();
    setStatus("active");
    resetIdleTimer();
  } else {
    setStatus("idle");
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Server reporting
// ---------------------------------------------------------------------------

function startReporting(): void {
  if (reportInterval) return;

  const report = () => {
    if (currentStatus !== "offline" && reportFn) {
      reportFn(currentStatus);
    }
  };

  report();
  reportInterval = setInterval(report, REPORT_INTERVAL_MS);
}

function stopReporting(): void {
  if (reportInterval) {
    clearInterval(reportInterval);
    reportInterval = null;
  }
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
 * Set the function that reports presence to the server.
 * Called by the event loop / layout after Zulip API is available.
 *
 * @param fn Called with "active" or "idle" every REPORT_INTERVAL_MS and on status change.
 */
export function setPresenceReporter(fn: (status: "active" | "idle") => void): void {
  reportFn = fn;
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
  startReporting();

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
    stopReporting();
  };
}
