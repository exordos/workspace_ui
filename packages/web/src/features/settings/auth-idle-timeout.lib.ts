/**
 * Auth idle-timeout presets: canonical list, ms conversion, runtime validation, safe resolve.
 */
import type { AuthIdleTimeout } from "./settings.types";

const HOUR_IN_MS = 60 * 60 * 1000;
const DAY_IN_MS = 24 * HOUR_IN_MS;

/** Preset → timeout in ms (`never` → null). */
const AUTH_IDLE_TIMEOUT_MS_BY_PRESET: Record<AuthIdleTimeout, number | null> = {
  "6h": 6 * HOUR_IN_MS,
  "12h": 12 * HOUR_IN_MS,
  "24h": 24 * HOUR_IN_MS,
  "3d": 3 * DAY_IN_MS,
  "7d": 7 * DAY_IN_MS,
  never: null,
};

export const AUTH_IDLE_TIMEOUT_PRESETS: readonly AuthIdleTimeout[] = [
  "6h",
  "12h",
  "24h",
  "3d",
  "7d",
  "never",
];

export function authIdleTimeoutToMs(timeout: AuthIdleTimeout): number | null {
  return AUTH_IDLE_TIMEOUT_MS_BY_PRESET[timeout];
}

export function isAuthIdleTimeout(value: unknown): value is AuthIdleTimeout {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(AUTH_IDLE_TIMEOUT_MS_BY_PRESET, value)
  );
}

export function resolveAuthIdleTimeout(value: unknown, fallback: AuthIdleTimeout): AuthIdleTimeout {
  return isAuthIdleTimeout(value) ? value : fallback;
}
