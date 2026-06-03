/**
 * Tests for the auth-idle-timeout domain module.
 *
 * Covers:
 * - preset-to-milliseconds conversion;
 * - special `never` preset handling;
 * - runtime input validation;
 * - fallback logic for invalid data.
 */
import { describe, expect, it } from "vitest";
import {
  AUTH_IDLE_TIMEOUT_PRESETS,
  authIdleTimeoutToMs,
  isAuthIdleTimeout,
  resolveAuthIdleTimeout,
} from "./auth-idle-timeout.lib";

/** Unit tests for the single source of truth for idle timeout presets. */
describe("auth idle timeout lib", () => {
  /** Each supported preset maps to a predictable millisecond value. */
  it("converts each preset to expected milliseconds", () => {
    expect(authIdleTimeoutToMs("6h")).toBe(6 * 60 * 60 * 1000);
    expect(authIdleTimeoutToMs("12h")).toBe(12 * 60 * 60 * 1000);
    expect(authIdleTimeoutToMs("24h")).toBe(24 * 60 * 60 * 1000);
    expect(authIdleTimeoutToMs("3d")).toBe(3 * 24 * 60 * 60 * 1000);
    expect(authIdleTimeoutToMs("7d")).toBe(7 * 24 * 60 * 60 * 1000);
  });

  /** The `never` preset must disable the guard via null. */
  it("returns null for never preset", () => {
    expect(authIdleTimeoutToMs("never")).toBeNull();
  });

  /** Public preset list must match the supported domain set. */
  it("contains all supported presets", () => {
    expect(AUTH_IDLE_TIMEOUT_PRESETS).toEqual(["6h", "12h", "24h", "3d", "7d", "never"]);
  });

  /** Type guard accepts only valid preset string values. */
  it("accepts only valid auth idle timeout values", () => {
    expect(isAuthIdleTimeout("6h")).toBe(true);
    expect(isAuthIdleTimeout("never")).toBe(true);
    expect(isAuthIdleTimeout("5h")).toBe(false);
    expect(isAuthIdleTimeout("")).toBe(false);
    expect(isAuthIdleTimeout(null)).toBe(false);
    expect(isAuthIdleTimeout(undefined)).toBe(false);
    expect(isAuthIdleTimeout(24)).toBe(false);
    expect(isAuthIdleTimeout({})).toBe(false);
  });

  /** Resolver returns fallback when input is invalid. */
  it("falls back when provided value is invalid", () => {
    expect(resolveAuthIdleTimeout("24h", "3d")).toBe("24h");
    expect(resolveAuthIdleTimeout("bad", "3d")).toBe("3d");
    expect(resolveAuthIdleTimeout(undefined, "never")).toBe("never");
  });
});
