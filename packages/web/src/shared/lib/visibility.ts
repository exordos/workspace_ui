/**
 * Page Visibility & Background Tab Management.
 *
 * Handles browser energy-saving behavior for background tabs:
 * - Timer throttling (setTimeout/setInterval slowed to 1s+ in background)
 * - Tab freezing (complete suspension after ~5 min)
 * - Recovery on tab resume (reconcile missed events)
 *
 * Usage:
 *   import { onVisibilityChange, isTabVisible, onTabResume } from "~/lib/visibility";
 *
 *   onTabResume(() => {
 *     // Re-fetch data, sync state, reconnect if needed
 *   });
 */

import { createLogger } from "./logger";

const log = createLogger("visibility");

type VisibilityCallback = (visible: boolean) => void;
type ResumeCallback = (hiddenDurationMs: number) => void;

const visibilityListeners = new Set<VisibilityCallback>();
const resumeListeners = new Set<ResumeCallback>();
let lastHiddenAt: number | null = null;

export function isTabVisible(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible";
}

export function isWindowActive(): boolean {
  if (typeof document === "undefined") return true;
  return isTabVisible() && document.hasFocus();
}

export function onVisibilityChange(callback: VisibilityCallback): () => void {
  visibilityListeners.add(callback);
  return () => visibilityListeners.delete(callback);
}

export function onTabResume(callback: ResumeCallback): () => void {
  resumeListeners.add(callback);
  return () => resumeListeners.delete(callback);
}

const STALE_THRESHOLD_MS = 30_000;

function handleVisibilityChange(): void {
  const visible = document.visibilityState === "visible";

  if (!visible) {
    lastHiddenAt = Date.now();
    log.info("Tab hidden");
  } else {
    const hiddenDuration = lastHiddenAt ? Date.now() - lastHiddenAt : 0;
    lastHiddenAt = null;

    log.info("Tab visible", { hiddenDurationMs: hiddenDuration });

    if (hiddenDuration > STALE_THRESHOLD_MS) {
      log.warn("Tab was hidden for a long time, triggering resume", {
        hiddenDurationMs: hiddenDuration,
      });
      for (const cb of resumeListeners) {
        try {
          cb(hiddenDuration);
        } catch {
          /* resume callback must not break others */
        }
      }
    }
  }

  for (const cb of visibilityListeners) {
    try {
      cb(visible);
    } catch {
      /* listener must not break others */
    }
  }
}

function handleFreeze(): void {
  log.warn("Page frozen by browser");
  lastHiddenAt ??= Date.now();
}

function handleResume(): void {
  const hiddenDuration = lastHiddenAt ? Date.now() - lastHiddenAt : 0;
  lastHiddenAt = null;
  log.warn("Page resumed from freeze", { hiddenDurationMs: hiddenDuration });

  for (const cb of resumeListeners) {
    try {
      cb(hiddenDuration);
    } catch {
      /* resume callback must not break others */
    }
  }
}

/**
 * Resilient interval that compensates for background tab throttling.
 * When tab becomes visible after being hidden, fires immediately if overdue.
 */
export function createResilientInterval(callback: () => void, intervalMs: number): () => void {
  let lastRun = Date.now();
  let timerId: ReturnType<typeof setInterval> | null = null;

  const run = () => {
    lastRun = Date.now();
    callback();
  };

  timerId = setInterval(() => {
    lastRun = Date.now();
    callback();
  }, intervalMs);

  const unsubVisibility = onVisibilityChange((visible) => {
    if (visible) {
      const elapsed = Date.now() - lastRun;
      if (elapsed >= intervalMs * 0.9) {
        run();
      }
    }
  });

  return () => {
    if (timerId) clearInterval(timerId);
    unsubVisibility();
  };
}

/**
 * Initialize visibility tracking. Call once at app startup.
 * Returns a cleanup function that removes all listeners.
 */
export function initVisibilityTracking(): () => void {
  if (typeof document === "undefined") return () => {};

  document.addEventListener("visibilitychange", handleVisibilityChange);
  document.addEventListener("freeze", handleFreeze);
  document.addEventListener("resume", handleResume);

  return () => {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    document.removeEventListener("freeze", handleFreeze);
    document.removeEventListener("resume", handleResume);
  };
}
