import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { getLocale, setLocale, t } from "~/i18n/i18n";
import {
  formatActivityItemTime,
  formatDateJoined,
  formatMessageTimeRelative,
  formatMessageTimeShort,
  formatMessageTimeWithDate,
} from "./datetime.lib";

describe("formatMessageTimeShort", () => {
  it("formats unix seconds as HH:MM", () => {
    expect(formatMessageTimeShort(1710331200)).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("cached calendar formatters", () => {
  let locale = getLocale();
  beforeEach(() => {
    locale = getLocale();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 20, 12));
    window.dispatchEvent(new Event("languagechange"));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    setLocale(locale);
    vi.useRealTimers();
  });

  it("reuses formatters and preserves existing locale and style output", () => {
    setLocale("ru");
    const old = new Date(2026, 9, 15, 9, 30);
    const ts = old.getTime() / 1000;
    const relative = old.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
    const dated = old.toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const activity = old.toLocaleDateString(undefined, { day: "numeric", month: "short" });
    const joined = old.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    const create = vi.spyOn(Intl, "DateTimeFormat");
    for (let i = 0; i < 100; i++) {
      expect(formatMessageTimeRelative(ts)).toBe(relative);
      expect(formatMessageTimeWithDate(ts)).toBe(`${dated} 09:30`);
      expect(formatActivityItemTime(ts)).toBe(activity);
      expect(formatDateJoined(old.toISOString())).toBe(joined);
    }
    expect(create).toHaveBeenCalledTimes(4);
    setLocale("en");
    expect(formatMessageTimeRelative(ts)).toBe(
      old.toLocaleDateString("en-US", { day: "numeric", month: "short" }),
    );
    expect(create).toHaveBeenCalledTimes(5);
  });

  it("recalculates today and yesterday across midnight without caching labels", () => {
    const ts = new Date(2026, 9, 20, 9, 30).getTime() / 1000;
    expect(formatMessageTimeRelative(ts)).toBe("09:30");
    vi.setSystemTime(new Date(2026, 9, 21, 0, 1));
    expect(formatMessageTimeRelative(ts)).toBe(t("chat.yesterday"));
    expect(formatActivityItemTime(ts)).toBe(`${t("chat.yesterday")} 09:30`);
    vi.setSystemTime(new Date(2026, 9, 22, 0, 1));
    expect(formatMessageTimeRelative(ts)).not.toBe(t("chat.yesterday"));
  });

  it("refreshes OS defaults on visibility and language changes and bounds offset variants", () => {
    const ts = new Date(2026, 9, 15).getTime() / 1000;
    const create = vi.spyOn(Intl, "DateTimeFormat");
    formatMessageTimeRelative(ts);
    formatMessageTimeRelative(ts);
    expect(create).toHaveBeenCalledTimes(1);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    formatMessageTimeRelative(ts);
    expect(create).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new Event("languagechange"));
    formatMessageTimeRelative(ts);
    expect(create).toHaveBeenCalledTimes(3);
    const offset = vi.spyOn(Date.prototype, "getTimezoneOffset");
    for (let i = 1; i <= 12; i++) {
      offset.mockReturnValue(i);
      formatMessageTimeRelative(ts);
    }
    offset.mockReturnValue(0);
    formatMessageTimeRelative(ts);
    expect(create).toHaveBeenCalledTimes(16);
  });

  it("preserves invalid input handling", () => {
    expect(formatMessageTimeRelative(Number.NaN)).toBe("Invalid Date");
    expect(formatMessageTimeWithDate(Number.NaN)).toBe("Invalid Date NaN:NaN");
    expect(formatActivityItemTime(Number.NaN)).toBe("Invalid Date");
    expect(formatDateJoined("invalid")).toBe("invalid");
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
