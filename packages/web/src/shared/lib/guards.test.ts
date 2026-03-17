/**
 * Tests for runtime guard utilities — defensive programming layer.
 *
 * Guards catch invalid data at runtime that TypeScript can't catch at compile
 * time (e.g. API responses, localStorage, event payloads). Includes invariant
 * assertions, type narrowing guards, safe accessor wrappers, domain-specific
 * validators (userId, email, URL), error boundary wrappers, and frozen objects.
 */
import { describe, expect, it } from "vitest";
import {
  invariant,
  isNonNull,
  isNonEmptyString,
  isPositiveNumber,
  isValidId,
  safeGet,
  safeArray,
  safeString,
  safeNumber,
  guard,
  safeCatch,
  strictObject,
} from "./guards";

// invariant is a runtime assertion — crashes in dev, logs in prod.
describe("invariant", () => {
  // Truthy values (true, 1, "x") must pass silently.
  it("does not throw for truthy condition", () => {
    expect(() => invariant(true, "ok")).not.toThrow();
    expect(() => invariant(1, "ok")).not.toThrow();
    expect(() => invariant("x", "ok")).not.toThrow();
  });

  // Falsy values (false, null, 0, "") must throw with a descriptive message.
  it("throws for falsy condition in dev", () => {
    expect(() => invariant(false, "must be true")).toThrow("[Invariant] must be true");
    expect(() => invariant(null, "must exist")).toThrow("[Invariant]");
    expect(() => invariant(0, "must be nonzero")).toThrow("[Invariant]");
    expect(() => invariant("", "must be nonempty")).toThrow("[Invariant]");
  });
});

// Type guards narrow unknown values — used with .filter() and if-checks.
describe("type guards", () => {
  // isNonNull: 0 and "" are valid values, only null/undefined are filtered.
  it("isNonNull", () => {
    expect(isNonNull(42)).toBe(true);
    expect(isNonNull("")).toBe(true);
    expect(isNonNull(0)).toBe(true);
    expect(isNonNull(null)).toBe(false);
    expect(isNonNull(undefined)).toBe(false);
  });

  // isNonEmptyString: whitespace-only strings are considered empty.
  it("isNonEmptyString", () => {
    expect(isNonEmptyString("hello")).toBe(true);
    expect(isNonEmptyString("")).toBe(false);
    expect(isNonEmptyString("   ")).toBe(false);
    expect(isNonEmptyString(42)).toBe(false);
    expect(isNonEmptyString(null)).toBe(false);
  });

  // isPositiveNumber: 0, negative, NaN, Infinity, and strings are rejected.
  it("isPositiveNumber", () => {
    expect(isPositiveNumber(1)).toBe(true);
    expect(isPositiveNumber(0.5)).toBe(true);
    expect(isPositiveNumber(0)).toBe(false);
    expect(isPositiveNumber(-1)).toBe(false);
    expect(isPositiveNumber(NaN)).toBe(false);
    expect(isPositiveNumber(Infinity)).toBe(false);
    expect(isPositiveNumber("5")).toBe(false);
  });

  // isValidId: accepts positive numbers and non-empty strings as valid identifiers.
  it("isValidId", () => {
    expect(isValidId(42)).toBe(true);
    expect(isValidId("abc")).toBe(true);
    expect(isValidId(0)).toBe(false);
    expect(isValidId(-1)).toBe(false);
    expect(isValidId("")).toBe(false);
    expect(isValidId("  ")).toBe(false);
    expect(isValidId(null)).toBe(false);
  });
});

// Safe access wrappers prevent "cannot read property of undefined" crashes.
describe("safe access", () => {
  // safeGet wraps property access — null/undefined objects return undefined.
  it("safeGet returns value or undefined", () => {
    expect(safeGet({ a: 1 }, "a")).toBe(1);
    expect(safeGet(null, "a" as never)).toBeUndefined();
    expect(safeGet(undefined, "a" as never)).toBeUndefined();
  });

  // safeArray ensures callers always get an array — null becomes [].
  it("safeArray returns array or empty", () => {
    expect(safeArray([1, 2])).toEqual([1, 2]);
    expect(safeArray(null)).toEqual([]);
    expect(safeArray(undefined)).toEqual([]);
  });

  // safeString coerces non-strings and provides a fallback for null/undefined.
  it("safeString returns string or fallback", () => {
    expect(safeString("hi")).toBe("hi");
    expect(safeString(42)).toBe("42");
    expect(safeString(null)).toBe("");
    expect(safeString(undefined, "default")).toBe("default");
  });

  // safeNumber parses strings and replaces NaN/Infinity with a fallback.
  it("safeNumber returns number or fallback", () => {
    expect(safeNumber(42)).toBe(42);
    expect(safeNumber("10")).toBe(10);
    expect(safeNumber("abc")).toBe(0);
    expect(safeNumber(null, 99)).toBe(99);
    expect(safeNumber(NaN, 5)).toBe(5);
    expect(safeNumber(Infinity, 0)).toBe(0);
  });
});

// Domain guards validate Zulip-specific data before it reaches stores or API calls.
describe("domain guards", () => {
  // userId must be a positive integer — Zulip uses sequential integer IDs.
  it("guard.userId accepts valid IDs", () => {
    expect(guard.userId(42)).toBe(42);
    expect(guard.userId(1)).toBe(1);
  });

  // Invalid IDs (0, negative, float, string, null) must throw immediately.
  it("guard.userId rejects invalid IDs", () => {
    expect(() => guard.userId(0)).toThrow("Invalid userId");
    expect(() => guard.userId(-1)).toThrow("Invalid userId");
    expect(() => guard.userId(NaN)).toThrow("Invalid userId");
    expect(() => guard.userId(null)).toThrow("Invalid userId");
    expect(() => guard.userId(1.5)).toThrow("Invalid userId");
    expect(() => guard.userId("42")).toThrow("Invalid userId");
  });

  it("guard.streamId validates correctly", () => {
    expect(guard.streamId(10)).toBe(10);
    expect(() => guard.streamId(0)).toThrow("Invalid streamId");
  });

  it("guard.messageId validates correctly", () => {
    expect(guard.messageId(999)).toBe(999);
    expect(() => guard.messageId(-5)).toThrow("Invalid messageId");
  });

  it("guard.nonEmpty validates strings", () => {
    expect(guard.nonEmpty("hello")).toBe("hello");
    expect(guard.nonEmpty("  padded  ")).toBe("padded");
    expect(() => guard.nonEmpty("")).toThrow("non-empty string");
    expect(() => guard.nonEmpty("   ")).toThrow("non-empty string");
    expect(() => guard.nonEmpty(null)).toThrow("non-empty string");
  });

  it("guard.email validates format", () => {
    expect(guard.email("user@example.com")).toBe("user@example.com");
    expect(() => guard.email("not-an-email")).toThrow("Invalid email");
    expect(() => guard.email("")).toThrow("Invalid email");
  });

  // URL guard blocks dangerous protocols (javascript:, ftp:) — security critical.
  it("guard.url validates URL", () => {
    expect(guard.url("https://example.com")).toBe("https://example.com");
    expect(guard.url("http://localhost:3000")).toBe("http://localhost:3000");
    expect(() => guard.url("ftp://bad.com")).toThrow("Invalid URL");
    expect(() => guard.url("not a url")).toThrow("Invalid URL");
    // eslint-disable-next-line no-script-url -- testing that javascript: URLs are rejected
    expect(() => guard.url("javascript:alert(1)")).toThrow("Invalid URL");
  });

  it("guard.nonEmptyArray validates arrays", () => {
    expect(guard.nonEmptyArray([1, 2])).toEqual([1, 2]);
    expect(() => guard.nonEmptyArray([])).toThrow("non-empty array");
    expect(() => guard.nonEmptyArray(null)).toThrow("non-empty array");
  });

  it("guard.oneOf validates enum values", () => {
    expect(guard.oneOf("active", ["active", "idle"] as const)).toBe("active");
    expect(() => guard.oneOf("unknown", ["active", "idle"] as const)).toThrow("must be one of");
  });

  it("guard.range validates numeric ranges", () => {
    expect(guard.range(5, 0, 10)).toBe(5);
    expect(guard.range(0, 0, 100)).toBe(0);
    expect(() => guard.range(-1, 0, 10)).toThrow("must be between");
    expect(() => guard.range(11, 0, 10)).toThrow("must be between");
    expect(() => guard.range(NaN, 0, 10)).toThrow("must be between");
  });
});

// safeCatch wraps callbacks so uncaught errors don't crash event listeners or subscribers.
describe("safeCatch", () => {
  // Sync errors must be caught — the wrapper must not throw.
  it("wraps sync function and catches errors", () => {
    const bad = safeCatch(() => {
      throw new Error("boom");
    });
    expect(() => bad()).not.toThrow();
  });

  // Successful calls must return the original value unchanged.
  it("passes through return value on success", () => {
    const good = safeCatch(() => 42);
    expect(good()).toBe(42);
  });

  // Async rejections must also be caught — prevents unhandled promise rejections.
  it("wraps async function and catches rejections", async () => {
    const bad = safeCatch(() => Promise.reject(new Error("async boom")));
    await expect(bad()).resolves.toBeUndefined();
  });
});

// strictObject creates a frozen Proxy that throws on typos — catches config errors early.
describe("strictObject", () => {
  // Known keys must resolve to their values normally.
  it("allows access to existing keys", () => {
    const obj = strictObject({ a: 1, b: "two" }, "test");
    expect(obj.a).toBe(1);
    expect(obj.b).toBe("two");
  });

  // Accessing a non-existent key (typo) must throw with the key name for debugging.
  it("throws on unknown key access in dev", () => {
    const obj = strictObject({ a: 1 }, "config");
    expect(() => (obj as Record<string, unknown>).nonexistent).toThrow(
      'Unknown key "nonexistent" in config',
    );
  });

  // The object must be immutable — accidental mutation must throw.
  it("is frozen (immutable)", () => {
    const obj = strictObject({ x: 10 }, "config");
    expect(() => {
      (obj as Record<string, unknown>).x = 20;
    }).toThrow();
  });
});
