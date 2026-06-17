import { describe, expect, it } from "vitest";
import {
  buildCalendarHomeUrl,
  buildCalendarHomeUrlCandidates,
  decodeCalendarDataXml,
  eventIntersectsRange,
  normalizeAllDayEndIso,
  sogoDavUserSegment,
  toCalDavTimeRangeValue,
} from "./calendar-caldav-url.lib";

describe("calendar-caldav-url.lib", () => {
  it("percent-encodes @ in SOGo user path", () => {
    expect(sogoDavUserSegment("user@mail.example.test")).toBe("user%40mail.example.test");
    expect(buildCalendarHomeUrl("https://mail.test", "/SOGo/dav", "user@mail.example.test")).toBe(
      "https://mail.test/SOGo/dav/user%40mail.example.test/Calendar/",
    );
  });

  it("lists encoded and literal home URL candidates", () => {
    const candidates = buildCalendarHomeUrlCandidates(
      "https://mail.test",
      "/SOGo/dav",
      "user@mail.example.test",
    );
    expect(candidates).toEqual([
      "https://mail.test/SOGo/dav/user%40mail.example.test/Calendar/",
      "https://mail.test/SOGo/dav/user@mail.example.test/Calendar/",
    ]);
  });

  it("decodes calendar-data XML entities", () => {
    const raw = "BEGIN:VCALENDAR&#x0D;&#10;VERSION:2.0";
    expect(decodeCalendarDataXml(raw)).toContain("BEGIN:VCALENDAR");
  });

  it("decodes numeric XML entities for Cyrillic text", () => {
    const raw = "SUMMARY:&#1094;&#1091;&#1077;&#1094;&#1091;&#1077;";
    expect(decodeCalendarDataXml(raw)).toBe("SUMMARY:цуецуе");
  });

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

  it("formats CalDAV time-range from calendar date string", () => {
    expect(toCalDavTimeRangeValue("2026-06-17")).toBe("20260617T000000Z");
    expect(toCalDavTimeRangeValue("2026-06-17T00:00:00.000Z")).toBe("20260617T000000Z");
  });
});
