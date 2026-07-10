import { describe, expect, it } from "vitest";
import { eventIntersectsRange, normalizeAllDayEndIso } from "./calendar-date.lib";

describe("calendar-date.lib", () => {
  it("normalizes degenerate all-day end date", () => {
    expect(normalizeAllDayEndIso("2026-06-15", "2026-06-15")).toBe("2026-06-16");
    expect(normalizeAllDayEndIso("2026-06-15", "2026-06-16")).toBe("2026-06-16");
  });

  it("detects range intersection for all-day single-day event", () => {
    const event = { start: "2026-06-15", end: "2026-06-15", allDay: true };
    const rangeStart = new Date("2026-06-01T00:00:00.000Z");
    const rangeEnd = new Date("2026-06-30T23:59:59.999Z");
    expect(eventIntersectsRange(event, rangeStart, rangeEnd)).toBe(true);
  });
});
