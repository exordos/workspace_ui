import { describe, expect, it } from "vitest";
import {
  buildIcsFromInput,
  buildIcsWithExdate,
  expandRecurringEvents,
  parseVeventFromIcs,
} from "./calendar-ical.lib";
import type { CalendarEvent } from "./calendar.types";

const SAMPLE_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//SOGo//EN
BEGIN:VEVENT
UID:test-event-1
SUMMARY:Team standup
DTSTART:20260615T100000Z
DTEND:20260615T103000Z
DESCRIPTION:Daily sync
LOCATION:Room A
ATTENDEE;CN=Alice;PARTSTAT=ACCEPTED;ROLE=REQ-PARTICIPANT:mailto:alice@example.test
BEGIN:VALARM
ACTION:DISPLAY
TRIGGER:-PT15M
END:VALARM
END:VEVENT
END:VCALENDAR`;

const SOGO_ALL_DAY_SAME_END = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:allday-1
DTSTART;VALUE=DATE:20260615
DTEND;VALUE=DATE:20260615
SUMMARY:Holiday
END:VEVENT
END:VCALENDAR`;

describe("calendar-ical.lib", () => {
  describe("parseVeventFromIcs", () => {
    it("parses a simple event with attendee and alarm", () => {
      const events = parseVeventFromIcs(SAMPLE_ICS, "personal", '"etag-1"');
      expect(events).toHaveLength(1);
      const event = events[0]!;
      expect(event.uid).toBe("test-event-1");
      expect(event.summary).toBe("Team standup");
      expect(event.calendarId).toBe("personal");
      expect(event.description).toBe("Daily sync");
      expect(event.location).toBe("Room A");
      expect(event.attendees).toHaveLength(1);
      expect(event.attendees[0]?.email).toBe("alice@example.test");
      expect(event.alarms).toHaveLength(1);
      expect(event.alarms[0]?.triggerMinutes).toBe(15);
    });

    it("normalizes SOGo all-day event with DTEND equal to DTSTART", () => {
      const events = parseVeventFromIcs(SOGO_ALL_DAY_SAME_END, "personal", null);
      expect(events).toHaveLength(1);
      expect(events[0]?.start).toBe("2026-06-15");
      expect(events[0]?.end).toBe("2026-06-16");
      expect(events[0]?.allDay).toBe(true);
    });
  });

  describe("buildIcsFromInput", () => {
    it("round-trips event fields through parse", () => {
      const ics = buildIcsFromInput(
        {
          calendarId: "personal",
          summary: "Lunch",
          start: "2026-06-20T12:00:00.000Z",
          end: "2026-06-20T13:00:00.000Z",
          description: "Cafe",
          attendees: [
            { email: "bob@example.test", displayName: "Bob", partstat: null, role: null },
          ],
          alarms: [{ triggerMinutes: 30, triggerAbsolute: null, action: "DISPLAY" }],
        },
        "uid-lunch",
      );
      const events = parseVeventFromIcs(ics, "personal", null);
      expect(events[0]?.summary).toBe("Lunch");
      expect(events[0]?.attendees[0]?.email).toBe("bob@example.test");
    });
  });

  describe("expandRecurringEvents", () => {
    it("expands weekly RRULE within range", () => {
      const master: CalendarEvent = {
        uid: "rec-1",
        calendarId: "personal",
        summary: "Weekly",
        description: null,
        location: null,
        start: "2026-06-01T10:00:00.000Z",
        end: "2026-06-01T11:00:00.000Z",
        allDay: false,
        etag: null,
        recurrence: { rrule: "FREQ=WEEKLY;COUNT=4" },
        attendees: [],
        alarms: [],
        recurrenceId: null,
        isRecurringInstance: false,
      };
      const expanded = expandRecurringEvents(
        [master],
        new Date("2026-06-01T00:00:00.000Z"),
        new Date("2026-06-30T23:59:59.999Z"),
      );
      expect(expanded.length).toBeGreaterThanOrEqual(3);
      expect(expanded.every((e) => e.isRecurringInstance)).toBe(true);
    });

    it("keeps master when expansion yields no occurrences but master is in range", () => {
      const master: CalendarEvent = {
        uid: "rec-2",
        calendarId: "personal",
        summary: "Monthly",
        description: null,
        location: null,
        start: "2026-06-15T10:00:00.000Z",
        end: "2026-06-15T11:00:00.000Z",
        allDay: false,
        etag: null,
        recurrence: { rrule: "FREQ=MONTHLY;BYMONTHDAY=15" },
        attendees: [],
        alarms: [],
        recurrenceId: null,
        isRecurringInstance: false,
      };
      const expanded = expandRecurringEvents(
        [master],
        new Date("2026-06-10T00:00:00.000Z"),
        new Date("2026-06-20T23:59:59.999Z"),
      );
      expect(expanded.some((e) => e.uid === "rec-2")).toBe(true);
    });
  });

  describe("buildIcsWithExdate", () => {
    it("adds EXDATE for a recurring instance", () => {
      const master: CalendarEvent = {
        uid: "rec-ex",
        calendarId: "personal",
        summary: "Weekly",
        description: null,
        location: null,
        start: "2026-06-01T10:00:00.000Z",
        end: "2026-06-01T11:00:00.000Z",
        allDay: false,
        etag: '"etag"',
        recurrence: { rrule: "FREQ=WEEKLY;COUNT=4" },
        attendees: [],
        alarms: [],
        recurrenceId: null,
        isRecurringInstance: false,
      };
      const ics = buildIcsWithExdate(master, "2026-06-08T10:00:00.000Z");
      expect(ics).toContain("EXDATE");
      expect(ics).toContain("20260608");
    });
  });
});
