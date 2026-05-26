/**
 * Connection health state for API resilience UI and coordinated reconnect.
 *
 * Tracks offline/degraded/rate-limited phases and serializes bootstrap retry attempts
 * with exponential backoff and Zulip rate-limit gate awareness.
 */
import { createLogger } from "~/shared/lib/logger";
import { isOnline, onReconnect, onStatusChange } from "~/shared/lib/network";
import {
  getZulipRateLimitBlockedUntil,
  subscribeZulipRateLimitGate,
  waitUntilZulipRateLimitReleased,
} from "~/shared/lib/zulip-rate-limit-gate";

const log = createLogger("connection-health");

const MIN_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 30_000;

export type ConnectionHealthPhase =
  | "offline"
  | "connecting"
  | "ready"
  | "degraded"
  | "blocked"
  | "rate_limited";

export type ConnectionFailureReason = "network" | "timeout" | "server" | "rate_limit" | "unknown";

export interface ConnectionHealthSnapshot {
  phase: ConnectionHealthPhase;
  retryAfterMs: number;
  lastFailureAt: number | null;
  reconnectAttempt: number;
  failureReason: ConnectionFailureReason | null;
  isReconnecting: boolean;
}

type HealthListener = () => void;
type ManualReconnectListener = () => void;

const listeners = new Set<HealthListener>();
const manualReconnectListeners = new Set<ManualReconnectListener>();

let snapshot: ConnectionHealthSnapshot = {
  phase: "connecting",
  retryAfterMs: 0,
  lastFailureAt: null,
  reconnectAttempt: 0,
  failureReason: null,
  isReconnecting: false,
};

let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let activeReconnectFn: (() => Promise<boolean>) | null = null;
let activeReconnectSignal: AbortSignal | undefined;
let reconnectBackoffAttempt = 0;
let transportFailureActive = false;

/** True when fetch failed despite `navigator.onLine` (no route to server). */
export function isLikelyNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes("failed to fetch") ||
      msg.includes("networkerror") ||
      msg.includes("network error") ||
      msg.includes("load failed") ||
      msg.includes("err_internet_disconnected") ||
      msg.includes("err_network_changed")
    );
  }
  if (err instanceof DOMException && err.name === "NetworkError") {
    return true;
  }
  return false;
}

/**
 * Called when the API transport fails (after retries). Updates banner / reconnect state
 * even when the browser still reports `navigator.onLine === true`.
 */
export function noteApiTransportFailure(err?: unknown): void {
  if (err != null && !isLikelyNetworkError(err)) {
    return;
  }
  if (
    transportFailureActive &&
    snapshot.failureReason === "network" &&
    (snapshot.phase === "degraded" || snapshot.phase === "offline")
  ) {
    return;
  }
  transportFailureActive = true;
  reportFailure({
    reason: "network",
    phase: "degraded",
  });
}

/** Clears transport-failure UI after a successful API response while online. */
export function noteApiTransportSuccess(): void {
  if (!isOnline()) {
    return;
  }
  if (
    !transportFailureActive &&
    snapshot.phase === "ready" &&
    snapshot.failureReason == null &&
    !snapshot.isReconnecting
  ) {
    return;
  }
  transportFailureActive = false;
  reportSuccess();
}

function shouldClearFailureUiOnNetworkRestore(): boolean {
  return (
    snapshot.phase === "offline" ||
    snapshot.phase === "degraded" ||
    snapshot.phase === "blocked" ||
    snapshot.failureReason === "network" ||
    snapshot.isReconnecting
  );
}

/** Hides connection-failure banner as soon as the browser reports connectivity restored. */
function handleBrowserNetworkOnline(): void {
  if (!isOnline()) {
    return;
  }
  transportFailureActive = false;
  reconnectBackoffAttempt = 0;
  if (!shouldClearFailureUiOnNetworkRestore()) {
    syncRateLimitFromGate();
    notify();
    return;
  }
  snapshot = {
    phase: "ready",
    retryAfterMs: 0,
    lastFailureAt: null,
    reconnectAttempt: 0,
    failureReason: null,
    isReconnecting: false,
  };
  syncRateLimitFromGate();
  notify();
}

function notify(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* listener must not break others */
    }
  }
}

function syncRateLimitFromGate(): void {
  const until = getZulipRateLimitBlockedUntil();
  const now = Date.now();
  if (until > now) {
    const retryAfterMs = until - now;
    if (snapshot.phase === "rate_limited" && snapshot.failureReason === "rate_limit") {
      return;
    }
    snapshot = {
      ...snapshot,
      phase: "rate_limited",
      retryAfterMs,
      failureReason: "rate_limit",
    };
    return;
  }
  if (snapshot.phase === "rate_limited") {
    const nextPhase: ConnectionHealthPhase = !isOnline()
      ? "offline"
      : snapshot.lastFailureAt != null
        ? "degraded"
        : "ready";
    snapshot = {
      ...snapshot,
      phase: nextPhase,
      retryAfterMs: 0,
      failureReason: snapshot.lastFailureAt != null ? snapshot.failureReason : null,
    };
  }
}

function getBackoffMs(attempt: number): number {
  const delay = MIN_BACKOFF_MS * Math.pow(1.5, attempt);
  return Math.min(delay, MAX_BACKOFF_MS);
}

function clearReconnectTimer(): void {
  if (reconnectTimer != null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function stopScheduledReconnect(): void {
  clearReconnectTimer();
  activeReconnectFn = null;
  activeReconnectSignal = undefined;
  reconnectBackoffAttempt = 0;
  if (snapshot.isReconnecting) {
    snapshot = { ...snapshot, isReconnecting: false };
    notify();
  }
}

async function runReconnectAttempt(): Promise<void> {
  const fn = activeReconnectFn;
  const signal = activeReconnectSignal;
  if (fn == null) return;
  if (signal?.aborted) {
    stopScheduledReconnect();
    return;
  }

  if (!isOnline()) {
    snapshot = { ...snapshot, phase: "offline", isReconnecting: false };
    notify();
    reconnectTimer = setTimeout(() => void runReconnectAttempt(), MIN_BACKOFF_MS);
    return;
  }

  syncRateLimitFromGate();
  const rateLimitMs = Math.max(0, getZulipRateLimitBlockedUntil() - Date.now());
  const backoffMs = getBackoffMs(reconnectBackoffAttempt);
  const waitMs = Math.max(backoffMs, rateLimitMs);

  snapshot = {
    ...snapshot,
    isReconnecting: true,
    reconnectAttempt: reconnectBackoffAttempt + 1,
    retryAfterMs: waitMs,
  };
  notify();

  await new Promise<void>((resolve) => {
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      resolve();
    }, waitMs);
  });

  if (activeReconnectFn !== fn || signal?.aborted) {
    stopScheduledReconnect();
    return;
  }

  try {
    await waitUntilZulipRateLimitReleased(signal);
    const ok = await fn();
    if (ok) {
      reportSuccess();
      stopScheduledReconnect();
      return;
    }
  } catch {
    /* retry below */
  }

  reconnectBackoffAttempt += 1;
  snapshot = {
    ...snapshot,
    isReconnecting: false,
    lastFailureAt: Date.now(),
    failureReason: snapshot.failureReason ?? "unknown",
    reconnectAttempt: reconnectBackoffAttempt,
  };
  notify();
  void runReconnectAttempt();
}

export function getConnectionHealthSnapshot(): ConnectionHealthSnapshot {
  // Do not sync or clone here — useSyncExternalStore compares snapshots with Object.is.
  // `syncRateLimitFromGate` updates `retryAfterMs` over time; running it during getSnapshot
  // would replace `snapshot` every render and cause "Maximum update depth exceeded".
  return snapshot;
}

export function subscribeConnectionHealth(listener: HealthListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setConnectionPhase(phase: ConnectionHealthPhase): void {
  if (snapshot.phase === phase) return;
  snapshot = { ...snapshot, phase };
  syncRateLimitFromGate();
  notify();
}

export function reportSuccess(): void {
  stopScheduledReconnect();
  transportFailureActive = false;
  snapshot = {
    phase: isOnline() ? "ready" : "offline",
    retryAfterMs: 0,
    lastFailureAt: null,
    reconnectAttempt: 0,
    failureReason: null,
    isReconnecting: false,
  };
  syncRateLimitFromGate();
  notify();
}

export function reportFailure(options: {
  reason: ConnectionFailureReason;
  retryAfterMs?: number;
  phase?: "degraded" | "blocked";
}): void {
  const phase = options.phase ?? (snapshot.phase === "blocked" ? "blocked" : "degraded");
  snapshot = {
    ...snapshot,
    phase: !isOnline() ? "offline" : phase,
    lastFailureAt: Date.now(),
    failureReason: options.reason,
    retryAfterMs: options.retryAfterMs ?? snapshot.retryAfterMs,
    isReconnecting: false,
  };
  syncRateLimitFromGate();
  log.warn("Connection degraded", { reason: options.reason, phase: snapshot.phase });
  notify();
}

/**
 * Serializes reconnect work with backoff and rate-limit waits.
 * `fn` should return true when the connection is restored.
 */
export function scheduleReconnect(
  fn: () => Promise<boolean>,
  options?: { signal?: AbortSignal; immediate?: boolean },
): void {
  stopScheduledReconnect();
  activeReconnectFn = fn;
  activeReconnectSignal = options?.signal;
  reconnectBackoffAttempt = 0;

  if (options?.immediate) {
    void runReconnectAttempt();
    return;
  }

  reconnectTimer = setTimeout(() => void runReconnectAttempt(), 0);
}

export function cancelScheduledReconnect(): void {
  stopScheduledReconnect();
}

export function registerManualReconnectListener(listener: ManualReconnectListener): () => void {
  manualReconnectListeners.add(listener);
  return () => {
    manualReconnectListeners.delete(listener);
  };
}

export function requestReconnect(options?: { showReconnecting?: boolean }): void {
  const showReconnecting = options?.showReconnecting ?? true;
  log.info("Manual reconnect requested", { showReconnecting });
  if (showReconnecting) {
    snapshot = { ...snapshot, isReconnecting: true };
    notify();
  }
  for (const fn of manualReconnectListeners) {
    try {
      fn();
    } catch {
      /* must not break others */
    }
  }
  if (activeReconnectFn != null) {
    clearReconnectTimer();
    reconnectBackoffAttempt = 0;
    void runReconnectAttempt();
    return;
  }
  snapshot = { ...snapshot, isReconnecting: false };
  notify();
}

export function initConnectionHealth(): () => void {
  if (typeof window === "undefined") return () => {};

  const unsubStatus = onStatusChange((online) => {
    if (!online) {
      transportFailureActive = true;
      snapshot = { ...snapshot, phase: "offline", isReconnecting: false };
      syncRateLimitFromGate();
      notify();
      return;
    }
    handleBrowserNetworkOnline();
  });

  const unsubReconnect = onReconnect(() => {
    handleBrowserNetworkOnline();
  });

  const unsubRateLimit = subscribeZulipRateLimitGate(() => {
    syncRateLimitFromGate();
    notify();
  });

  if (!isOnline()) {
    snapshot = { ...snapshot, phase: "offline" };
    notify();
  }

  return () => {
    unsubStatus();
    unsubReconnect();
    unsubRateLimit();
    stopScheduledReconnect();
    listeners.clear();
    manualReconnectListeners.clear();
  };
}

/** Test helper: resets module state. */
export function resetConnectionHealthForTests(): void {
  stopScheduledReconnect();
  transportFailureActive = false;
  snapshot = {
    phase: "connecting",
    retryAfterMs: 0,
    lastFailureAt: null,
    reconnectAttempt: 0,
    failureReason: null,
    isReconnecting: false,
  };
  listeners.clear();
  manualReconnectListeners.clear();
}
