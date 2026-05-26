/**
 * Defensive programming guards — "fool-proof" runtime safety net.
 *
 * These utilities catch programmer mistakes early with clear error messages.
 * Use at module boundaries, store actions, and API call sites.
 *
 * Philosophy:
 * - Fail fast in development, degrade gracefully in production
 * - Every guard explains WHAT went wrong and WHERE
 * - Never silently swallow invalid data
 *
 * Usage:
 *   import { invariant, assertNever, guard } from "~/shared/lib/guards";
 *
 *   invariant(userId != null, "userId is required for presence update");
 *   const label = assertNever(status); // exhaustive switch check
 *   guard.userId(id);  // throws if not a positive integer
 */

import { createLogger } from "./logger";

const log = createLogger("guard");

const IS_DEV = import.meta.env?.DEV ?? false;

// ---------------------------------------------------------------------------
// invariant — assert a condition, throw in dev, log+return in prod
// ---------------------------------------------------------------------------

export function invariant(condition: unknown, message: string): asserts condition {
  if (condition) return;

  const error = new Error(`[Invariant] ${message}`);

  if (IS_DEV) {
    throw error;
  }

  log.error(error.message);
}

// ---------------------------------------------------------------------------
// assertNever — exhaustive switch/if-else check
// ---------------------------------------------------------------------------

export function assertNever(value: never, label = "Unexpected value"): never {
  const msg = `[assertNever] ${label}: ${JSON.stringify(value)}`;
  if (IS_DEV) throw new Error(msg);
  log.error(msg);
  throw new Error(msg);
}

// ---------------------------------------------------------------------------
// Type guard factories
// ---------------------------------------------------------------------------

export function isNonNull<T>(value: T | null | undefined): value is T {
  return value != null;
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function isValidId(value: unknown): value is string | number {
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return false;
}

// ---------------------------------------------------------------------------
// Safe access — prevent "cannot read property of undefined"
// ---------------------------------------------------------------------------

export function safeGet<T, K extends keyof T>(obj: T | null | undefined, key: K): T[K] | undefined {
  return obj != null ? obj[key] : undefined;
}

export function safeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

export function safeString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (value == null) return fallback;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  return fallback;
}

export function safeNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Domain-specific guards
// ---------------------------------------------------------------------------

export const guard = {
  /**
   * Validate user ID before API calls.
   * Catches: undefined, null, 0, NaN, negative, non-integer.
   */
  userId(value: unknown, context = ""): number {
    invariant(
      typeof value === "number" && Number.isInteger(value) && value > 0,
      `Invalid userId: ${JSON.stringify(value)}${context ? ` in ${context}` : ""}`,
    );
    return value;
  },

  /**
   * Validate stream ID before API calls.
   */
  streamId(value: unknown, context = ""): number {
    invariant(
      typeof value === "number" && Number.isInteger(value) && value > 0,
      `Invalid streamId: ${JSON.stringify(value)}${context ? ` in ${context}` : ""}`,
    );
    return value;
  },

  /**
   * Validate message ID.
   */
  messageId(value: unknown, context = ""): number {
    invariant(
      typeof value === "number" && Number.isInteger(value) && value > 0,
      `Invalid messageId: ${JSON.stringify(value)}${context ? ` in ${context}` : ""}`,
    );
    return value;
  },

  /**
   * Validate non-empty string (topic name, stream name, etc.).
   */
  nonEmpty(value: unknown, label = "value"): string {
    invariant(
      typeof value === "string" && value.trim().length > 0,
      `${label} must be a non-empty string, got: ${JSON.stringify(value)}`,
    );
    return value.trim();
  },

  /**
   * Validate email format.
   */
  email(value: unknown, context = ""): string {
    const s = safeString(value);
    invariant(
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s),
      `Invalid email format${context ? ` in ${context}` : ""}`,
    );
    return s;
  },

  /**
   * Validate URL (https/http only).
   */
  url(value: unknown, context = ""): string {
    const s = safeString(value);
    let valid = false;
    try {
      const parsed = new URL(s);
      valid = parsed.protocol === "https:" || parsed.protocol === "http:";
    } catch {
      /* invalid URL */
    }
    invariant(valid, `Invalid URL${context ? ` in ${context}` : ""}`);
    return s;
  },

  /**
   * Validate array is not empty.
   */
  nonEmptyArray<T>(value: T[] | null | undefined, label = "array"): T[] {
    invariant(Array.isArray(value) && value.length > 0, `${label} must be a non-empty array`);
    return value;
  },

  /**
   * Validate value is one of allowed options (enum-like).
   */
  oneOf<T extends string | number>(value: unknown, allowed: readonly T[], label = "value"): T {
    invariant(
      allowed.includes(value as T),
      `${label} must be one of [${allowed.join(", ")}], got: ${JSON.stringify(value)}`,
    );
    return value as T;
  },

  /**
   * Validate value is within numeric range.
   */
  range(value: number, min: number, max: number, label = "value"): number {
    invariant(
      Number.isFinite(value) && value >= min && value <= max,
      `${label} must be between ${min} and ${max}, got: ${value}`,
    );
    return value;
  },
};

// ---------------------------------------------------------------------------
// Safe wrappers for dangerous operations
// ---------------------------------------------------------------------------

/**
 * Wrap a callback to prevent it from crashing the caller.
 * Logs the error instead of propagating.
 */
export function safeCatch<T extends (...args: never[]) => unknown>(fn: T, context = "callback"): T {
  return ((...args: Parameters<T>) => {
    try {
      const result = fn(...args);
      if (result instanceof Promise) {
        return (result as Promise<unknown>).catch((err: unknown) => {
          log.error(`${context} async error`, { error: String(err) });
        });
      }
      return result;
    } catch (err) {
      log.error(`${context} sync error`, { error: String(err) });
      return undefined;
    }
  }) as T;
}

/**
 * Create a frozen object that throws when accessing undefined keys (dev only).
 * Useful for config objects to catch typos.
 */
export function strictObject<T extends Record<string, unknown>>(obj: T, name = "config"): T {
  if (!IS_DEV) return Object.freeze(obj);

  return new Proxy(Object.freeze(obj), {
    get(target, prop) {
      if (typeof prop === "symbol" || prop in target) {
        return target[prop as keyof T];
      }
      throw new Error(
        `[strictObject] Unknown key "${String(prop)}" in ${name}. Available: [${Object.keys(target).join(", ")}]`,
      );
    },
  });
}
