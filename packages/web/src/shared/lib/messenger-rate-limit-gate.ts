/**
 * Global throttle for Messenger REST traffic when the server returns rate-limit errors.
 *
 * Workspace may respond with HTTP 200 and JSON `{ result: "error", code: "RATE_LIMIT_HIT", "retry-after": <seconds> }`,
 * which bypasses HTTP-level retry logic. This module records a wall-clock release time and blocks subsequent
 * `messengerApi` requests until it passes.
 *
 * Usage:
 *   import { ingestMessengerRateLimitFromApiResponse, waitUntilMessengerRateLimitReleased } from "~/shared/lib/messenger-rate-limit-gate";
 */

import { createLogger } from "~/shared/lib/logger";

const log = createLogger("api:messenger-rate-limit");

const RATE_LIMIT_CODES = new Set(["RATE_LIMIT_HIT", "RATE_LIMITED"]);

const MIN_DELAY_MS = 50;
const MAX_DELAY_MS = 120_000;

const listeners = new Set<() => void>();

let blockedUntil = 0;

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

/** Parses Workspace JSON `retry-after` (seconds, may be fractional). */
function parseRetryAfterSecondsFromBody(data: Record<string, unknown>): number | null {
  const raw = data["retry-after"];
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
    return raw;
  }
  if (typeof raw === "string") {
    const n = Number(raw.trim());
    if (Number.isFinite(n) && n >= 0) {
      return n;
    }
  }
  return null;
}

/** Parses `Retry-After` when it is a non-negative integer (seconds). */
function parseRetryAfterHeaderSeconds(header: string | null): number | null {
  if (header == null) {
    return null;
  }
  const trimmed = header.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

function clampDelayMs(ms: number): number {
  if (!Number.isFinite(ms)) {
    return MIN_DELAY_MS;
  }
  const rounded = Math.ceil(ms);
  return Math.min(Math.max(rounded, MIN_DELAY_MS), MAX_DELAY_MS);
}

function notifyListeners(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      // Subscriber errors must not break the gate
    }
  }
}

/**
 * Reads a completed Messenger API response and extends the global block window when rate-limited.
 * Safe to call for every response; no-ops unless status is 429 or body matches Workspace rate limit errors.
 */
export function ingestMessengerRateLimitFromApiResponse(
  status: number,
  data: unknown,
  headers: Headers,
): void {
  const headerSeconds = parseRetryAfterHeaderSeconds(headers.get("Retry-After"));

  const jsonRateLimit =
    isRecord(data) &&
    data.result === "error" &&
    typeof data.code === "string" &&
    RATE_LIMIT_CODES.has(data.code);

  if (!jsonRateLimit && status !== 429) {
    return;
  }

  let delayMs: number;
  if (jsonRateLimit) {
    const bodySec = parseRetryAfterSecondsFromBody(data);
    if (bodySec != null) {
      delayMs = clampDelayMs(bodySec * 1000);
    } else if (headerSeconds != null) {
      delayMs = clampDelayMs(headerSeconds * 1000);
    } else {
      delayMs = clampDelayMs(1000);
    }
  } else if (headerSeconds != null) {
    delayMs = clampDelayMs(headerSeconds * 1000);
  } else {
    delayMs = clampDelayMs(1000);
  }

  const until = Date.now() + delayMs;
  if (until > blockedUntil) {
    blockedUntil = until;
    log.warn("Workspace rate limit active", {
      delayMs,
      code: jsonRateLimit && isRecord(data) ? data.code : undefined,
    });
    notifyListeners();
  }
}

function sleepMs(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const id = setTimeout(finish, ms);
    const onAbort = () => {
      clearTimeout(id);
      signal?.removeEventListener("abort", onAbort);
      reject(new DOMException("Aborted", "AbortError"));
    };
    function finish() {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }
    if (signal) {
      if (signal.aborted) {
        clearTimeout(id);
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

/** Resolves when the global rate-limit window has passed; re-checks if the window is extended while waiting. */
export async function waitUntilMessengerRateLimitReleased(signal?: AbortSignal): Promise<void> {
  for (;;) {
    const until = blockedUntil;
    const now = Date.now();
    if (now >= until) {
      return;
    }
    await sleepMs(until - now, signal);
  }
}

export function getWorkspaceRateLimitBlockedUntil(): number {
  return blockedUntil;
}

/** Subscribe to gate changes (blockedUntil updates). Returns unsubscribe. */
export function subscribeWorkspaceRateLimitGate(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test helper: resets module state. */
export function resetWorkspaceRateLimitGateForTests(): void {
  blockedUntil = 0;
  listeners.clear();
}
