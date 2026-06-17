import { describe, expect, it } from "vitest";
import {
  parseCalendarEventInput,
  parseCalendarIdsQuery,
  parseIsoDateQuery,
} from "./calendar-validation.lib";

describe("calendar-validation.lib", () => {
  it("parses comma-separated calendar ids", () => {
    expect(parseCalendarIdsQuery("personal,shared")).toEqual(["personal", "shared"]);
  });

  it("parses ISO date query", () => {
    const iso = parseIsoDateQuery("2026-06-01T00:00:00.000Z", "start");
    expect(iso).toBe("2026-06-01T00:00:00.000Z");
  });

  it("parses event input payload", () => {
    const input = parseCalendarEventInput({
      calendarId: "personal",
      summary: "Meet",
      start: "2026-06-15T10:00:00.000Z",
      end: "2026-06-15T11:00:00.000Z",
      allDay: false,
    });
    expect(input.calendarId).toBe("personal");
    expect(input.summary).toBe("Meet");
  });

  it("rejects missing summary", () => {
    expect(() =>
      parseCalendarEventInput({
        calendarId: "personal",
        start: "2026-06-15T10:00:00.000Z",
        end: "2026-06-15T11:00:00.000Z",
      }),
    ).toThrow("summary is required");
  });
});
