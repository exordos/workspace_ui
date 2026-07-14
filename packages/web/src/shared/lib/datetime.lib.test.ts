import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  formatDateJoined,
  formatMailMessageDetailTime,
  formatMailMessageListTime,
  formatMessageTimeRelative,
  formatMessageTimeShort,
  formatMessageTimeWithDate,
} from "./datetime.lib";

describe("formatMessageTimeShort", () => {
  it("formats unix seconds as HH:MM", () => {
    expect(formatMessageTimeShort(1710331200)).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("formatMessageTimeRelative", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-14T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns time string for today", () => {
    const noonUtc = Math.floor(new Date("2026-03-14T10:00:00Z").getTime() / 1000);
    const result = formatMessageTimeRelative(noonUtc);
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("formatMessageTimeWithDate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-14T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses short time for same day", () => {
    const ts = Math.floor(new Date("2026-03-14T10:00:00Z").getTime() / 1000);
    expect(formatMessageTimeWithDate(ts)).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("formatMailMessageListTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-11T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats ISO mail dates without NaN", () => {
    expect(formatMailMessageListTime("2026-06-11T10:00:00.000Z")).toMatch(/^\d{2}:\d{2}$/);
    expect(formatMailMessageListTime("2026-06-11T10:00:00.000Z")).not.toContain("NaN");
  });

  it("shows short date for yesterday", () => {
    const result = formatMailMessageListTime("2026-06-10T15:00:00.000Z");
    expect(result).not.toMatch(/^\d{2}:\d{2}$/);
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns empty string for invalid input", () => {
    expect(formatMailMessageListTime("not-a-date")).toBe("");
  });
});

describe("formatMailMessageDetailTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-11T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats ISO mail dates for preview header", () => {
    expect(formatMailMessageDetailTime("2026-06-11T10:00:00.000Z")).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("formatDateJoined", () => {
  it("returns undefined for empty input", () => {
    expect(formatDateJoined(undefined)).toBeUndefined();
    expect(formatDateJoined("  ")).toBeUndefined();
  });

  it("formats valid ISO dates", () => {
    const result = formatDateJoined("2024-06-15T00:00:00.000Z");
    expect(result).toBeTruthy();
  });
});
