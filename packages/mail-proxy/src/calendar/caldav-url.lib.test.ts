import { describe, expect, it } from "vitest";
import {
  buildCalendarHomeUrl,
  buildCalendarHomeUrlCandidates,
  decodeCalendarDataXml,
  sogoDavUserSegment,
  toCalDavTimeRangeValue,
} from "./caldav-url.lib";

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

  it("formats CalDAV time-range from calendar date string", () => {
    expect(toCalDavTimeRangeValue("2026-06-17")).toBe("20260617T000000Z");
    expect(toCalDavTimeRangeValue("2026-06-17T00:00:00.000Z")).toBe("20260617T000000Z");
  });
});
