/**
 * Page Visibility, Window Focus & Background Tab Management.
 *
 * Handles browser energy-saving behavior for background tabs:
 * - Timer throttling (setTimeout/setInterval slowed to 1s+ in background)
 * - Tab freezing (complete suspension after ~5 min)
 * - Recovery on tab resume (reconcile missed events)
 *
 * On top of the two states the platform gives us, this module tracks a third one
 * the platform does nothing about. A desktop window that is on screen but not
 * focused keeps `visibilityState === "visible"`, so Chromium throttles nothing:
 * timers run at full rate and the compositor keeps animating. For a messenger
 * that is the normal all-day state, so the app has to stand it down itself.
 *
 *   active  — visible and focused; the user is here
 *   visible — on screen but not focused; no platform throttling applies
 *   hidden  — tab in background or window minimized; the platform throttles
 *
 * The current state is mirrored onto `<html data-window-activity>` so CSS can
 * react without a React render (see `app.styles.css`).
 *
 * Usage:
 *   import { onVisibilityChange, isTabVisible, onTabResume } from "~/lib/visibility";
 *
 *   onTabResume(() => {
 *     // Re-fetch data, sync state, reconnect if needed
 *   });
 *
 *   onActivityStateChange((state) => {
 *     // Stand background work down when state !== "active"
 *   });
 */

import { createLogger } from "./logger";

const log = createLogger("visibility");

type VisibilityCallback = (visible: boolean) => void;
type ResumeCallback = (hiddenDurationMs: number) => void;

/** See the module header for what separates `visible` from `active`. */
export type WindowActivityState = "active" | "visible" | "hidden";

type ActivityCallback = (state: WindowActivityState) => void;

const visibilityListeners = new Set<VisibilityCallback>();
const resumeListeners = new Set<ResumeCallback>();
const activityListeners = new Set<ActivityCallback>();
let lastHiddenAt: number | null = null;

// Focus is tracked from events rather than polled: `document.hasFocus()` cannot be
// observed for changes, and the state machine has to react the moment focus moves.
let windowFocused = typeof document === "undefined" ? true : document.hasFocus();
let activityState: WindowActivityState = "active";

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

/** Current window activity state. See the module header. */
export function getActivityState(): WindowActivityState {
  return activityState;
}

/**
 * Subscribe to activity transitions. Fires only on an actual state change.
 * The callback is invoked once immediately with the current state so callers
 * do not have to duplicate the initial decision.
 */
export function onActivityStateChange(callback: ActivityCallback): () => void {
  activityListeners.add(callback);
  try {
    callback(activityState);
  } catch {
    /* subscriber must not break registration */
  }
  return () => activityListeners.delete(callback);
}

function computeActivityState(): WindowActivityState {
  if (!isTabVisible()) return "hidden";
  return windowFocused ? "active" : "visible";
}

function syncActivityState(): void {
  const next = computeActivityState();
  if (next === activityState) return;
  activityState = next;

  // CSS reads this to stop animating a window nobody is looking at.
  if (typeof document !== "undefined") {
    document.documentElement.dataset.windowActivity = next;
  }

  log.info("Window activity changed", { state: next });

  for (const cb of activityListeners) {
    try {
      cb(next);
    } catch {
      /* listener must not break others */
    }
  }
}

function handleWindowFocus(): void {
  windowFocused = true;
  syncActivityState();
}

function handleWindowBlur(): void {
  windowFocused = false;
  syncActivityState();
}

/**
 * Feed focus in from outside the document — the Electron main process knows
 * whether the window is focused even when the renderer's own focus events are at
 * the mercy of the window manager. Same state machine, more reliable source.
 */
export function setExternalWindowFocus(focused: boolean): void {
  if (windowFocused === focused) return;
  windowFocused = focused;
  syncActivityState();
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

  syncActivityState();
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

export interface ActivityAwareIntervalOptions {
  /** Delay before the next run, given the window activity it is scheduled for. */
  delayFor: (state: WindowActivityState) => number;
  /** Run once immediately on the transition back to `active`. Defaults to false. */
  runOnFocus?: boolean;
}

export interface ActivityAwareInterval {
  /** Re-arm the current wait. Call when an input to `delayFor` changed. */
  reschedule: () => void;
  stop: () => void;
}

/**
 * Interval whose cadence follows window activity.
 *
 * Chromium throttles nothing while a window is merely unfocused, so anything on
 * a short interval keeps the CPU awake all day for a user who is not looking.
 * Callers state what the work is worth in each state instead.
 *
 * Implemented with a chained timeout rather than setInterval so a state change
 * takes effect on the next tick instead of at the end of the old period.
 */
export function createActivityAwareInterval(
  callback: () => void,
  { delayFor, runOnFocus = false }: ActivityAwareIntervalOptions,
): ActivityAwareInterval {
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let scheduledFor: WindowActivityState | null = null;
  let stopped = false;

  const schedule = (state: WindowActivityState): void => {
    if (stopped) return;
    if (timerId != null) clearTimeout(timerId);
    scheduledFor = state;
    timerId = setTimeout(() => {
      callback();
      schedule(getActivityState());
    }, delayFor(state));
  };

  schedule(getActivityState());

  const unsubscribe = onActivityStateChange((state) => {
    if (stopped || state === scheduledFor) return;
    if (runOnFocus && state === "active") {
      callback();
    }
    schedule(state);
  });

  return {
    reschedule: () => schedule(getActivityState()),
    stop: () => {
      stopped = true;
      unsubscribe();
      if (timerId != null) clearTimeout(timerId);
    },
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
  window.addEventListener("focus", handleWindowFocus);
  window.addEventListener("blur", handleWindowBlur);

  // Seed from the live state so the very first paint already carries the attribute.
  windowFocused = document.hasFocus();
  activityState = computeActivityState();
  document.documentElement.dataset.windowActivity = activityState;

  return () => {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    document.removeEventListener("freeze", handleFreeze);
    document.removeEventListener("resume", handleResume);
    window.removeEventListener("focus", handleWindowFocus);
    window.removeEventListener("blur", handleWindowBlur);
  };
}
