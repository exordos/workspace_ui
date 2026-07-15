import { describe, expect, it } from "vitest";
import {
  formatAlarmLabel,
  formatAttendeePartstat,
  formatEventDuration,
  formatEventWhen,
  formatRecurrenceLabel,
} from "./calendar-display.lib";
import type { CalendarEvent } from "./calendar.types";

const baseEvent: Omit<CalendarEvent, "start" | "end" | "allDay" | "summary"> = {
  uid: "1",
  calendarId: "personal",
  description: null,
  location: null,
  recurrence: null,
  attendees: [],
  alarms: [],
  recurrenceId: null,
  isRecurringInstance: false,
};

describe("calendar-display.lib", () => {
  it("formats timed event on one day", () => {
    const when = formatEventWhen({
      ...baseEvent,
      summary: "Meet",
      allDay: false,
      start: "2026-06-17T10:00:00",
      end: "2026-06-17T11:30:00",
    });
    expect(when.dateLine).toContain("2026");
    expect(when.timeLine).toMatch(/10:00.*11:30/);
  });

  it("formats all-day single-day event", () => {
    const when = formatEventWhen({
      ...baseEvent,
      summary: "Holiday",
      allDay: true,
      start: "2026-06-17",
      end: "2026-06-17",
    });
    expect(when.timeLine).toBe("All day");
  });

  it("formats event duration", () => {
    const label = formatEventDuration({
      ...baseEvent,
      summary: "Meet",
      allDay: false,
      start: "2026-06-17T10:00:00",
      end: "2026-06-17T11:30:00",
    });
    expect(label).toContain("1");
  });

  it("maps recurrence presets", () => {
    expect(formatRecurrenceLabel("FREQ=WEEKLY")).toBe("Weekly");
  });

  it("maps attendee partstat", () => {
    expect(formatAttendeePartstat("ACCEPTED")).toBe("Accepted");
  });

  it("formats relative alarm", () => {
    expect(formatAlarmLabel({ triggerMinutes: 15, triggerAbsolute: null, action: "DISPLAY" })).toBe(
      "15 minutes before",
    );
  });
});
