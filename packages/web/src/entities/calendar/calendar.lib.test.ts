import { describe, expect, it } from "vitest";
import {
  buildMonthGrid,
  dateFromGridOffsetPx,
  eventOccursOnDay,
  getNowIndicatorTopPx,
  layoutTimedEventsOnDay,
  sortEventsByStart,
  toIsoDate,
} from "./calendar.lib";
import type { CalendarEvent } from "./calendar.types";

describe("calendar.lib", () => {
  it("builds 42-day month grid", () => {
    const grid = buildMonthGrid(new Date("2026-06-15T12:00:00"));
    expect(grid).toHaveLength(42);
    expect(grid.some((c) => c.isoDate === "2026-06-01")).toBe(true);
  });

  it("detects all-day event when DTEND equals DTSTART (SOGo)", () => {
    const event: CalendarEvent = {
      uid: "1",
      calendarId: "personal",
      summary: "Holiday",
      description: null,
      location: null,
      start: "2026-06-15",
      end: "2026-06-15",
      allDay: true,
      recurrence: null,
      attendees: [],
      alarms: [],
      recurrenceId: null,
      isRecurringInstance: false,
    };
    expect(eventOccursOnDay(event, "2026-06-15")).toBe(true);
    expect(eventOccursOnDay(event, "2026-06-16")).toBe(false);
  });

  it("detects timed event on day", () => {
    const event: CalendarEvent = {
      uid: "1",
      calendarId: "personal",
      summary: "Meet",
      description: null,
      location: null,
      start: "2026-06-15T10:00:00.000Z",
      end: "2026-06-15T11:00:00.000Z",
      allDay: false,
      recurrence: null,
      attendees: [],
      alarms: [],
      recurrenceId: null,
      isRecurringInstance: false,
    };
    expect(eventOccursOnDay(event, "2026-06-15")).toBe(true);
    expect(eventOccursOnDay(event, "2026-06-16")).toBe(false);
  });

  it("sorts events by start", () => {
    const a: CalendarEvent = {
      uid: "a",
      calendarId: "personal",
      summary: "A",
      description: null,
      location: null,
      start: "2026-06-16T10:00:00.000Z",
      end: "2026-06-16T11:00:00.000Z",
      allDay: false,
      recurrence: null,
      attendees: [],
      alarms: [],
      recurrenceId: null,
      isRecurringInstance: false,
    };
    const b = {
      ...a,
      uid: "b",
      start: "2026-06-15T10:00:00.000Z",
      end: "2026-06-15T11:00:00.000Z",
    };
    expect(sortEventsByStart([a, b])[0]?.uid).toBe("b");
  });

  it("formats iso date", () => {
    expect(toIsoDate(new Date("2026-03-05T15:00:00"))).toBe("2026-03-05");
  });

  it("layouts timed event by local minutes on day", () => {
    const event: CalendarEvent = {
      uid: "1",
      calendarId: "personal",
      summary: "Meet",
      description: null,
      location: null,
      start: "2026-06-17T10:00:00",
      end: "2026-06-17T11:30:00",
      allDay: false,
      recurrence: null,
      attendees: [],
      alarms: [],
      recurrenceId: null,
      isRecurringInstance: false,
    };
    const [layout] = layoutTimedEventsOnDay([event], "2026-06-17");
    expect(layout?.topPx).toBe(10 * 48);
    expect(layout?.heightPx).toBe(1.5 * 48);
    expect(layout?.leftPercent).toBe(0);
    expect(layout?.widthPercent).toBe(100);
  });

  it("places simultaneous events side by side", () => {
    const base: Omit<CalendarEvent, "uid" | "summary" | "start" | "end"> = {
      calendarId: "personal",
      description: null,
      location: null,
      allDay: false,
      recurrence: null,
      attendees: [],
      alarms: [],
      recurrenceId: null,
      isRecurringInstance: false,
    };
    const events: CalendarEvent[] = [
      {
        ...base,
        uid: "a",
        summary: "A",
        start: "2026-06-17T10:00:00",
        end: "2026-06-17T11:00:00",
      },
      {
        ...base,
        uid: "b",
        summary: "B",
        start: "2026-06-17T10:00:00",
        end: "2026-06-17T11:00:00",
      },
    ];
    const layouts = layoutTimedEventsOnDay(events, "2026-06-17");
    expect(layouts).toHaveLength(2);
    expect(layouts.map((item) => item.widthPercent).sort()).toEqual([50, 50]);
    expect(layouts.map((item) => item.leftPercent).sort()).toEqual([0, 50]);
  });

  it("uses three columns for three overlapping events", () => {
    const base: Omit<CalendarEvent, "uid" | "summary" | "start" | "end"> = {
      calendarId: "personal",
      description: null,
      location: null,
      allDay: false,
      recurrence: null,
      attendees: [],
      alarms: [],
      recurrenceId: null,
      isRecurringInstance: false,
    };
    const events: CalendarEvent[] = [
      {
        ...base,
        uid: "a",
        summary: "A",
        start: "2026-06-17T09:00:00",
        end: "2026-06-17T11:00:00",
      },
      {
        ...base,
        uid: "b",
        summary: "B",
        start: "2026-06-17T10:00:00",
        end: "2026-06-17T12:00:00",
      },
      {
        ...base,
        uid: "c",
        summary: "C",
        start: "2026-06-17T10:00:00",
        end: "2026-06-17T11:00:00",
      },
    ];
    const layouts = layoutTimedEventsOnDay(events, "2026-06-17");
    expect(layouts.every((item) => item.widthPercent === 100 / 3)).toBe(true);
    expect(layouts.map((item) => item.leftPercent).sort()).toEqual([0, 100 / 3, 200 / 3]);
  });

  it("keeps non-overlapping events full width", () => {
    const base: Omit<CalendarEvent, "uid" | "summary" | "start" | "end"> = {
      calendarId: "personal",
      description: null,
      location: null,
      allDay: false,
      recurrence: null,
      attendees: [],
      alarms: [],
      recurrenceId: null,
      isRecurringInstance: false,
    };
    const events: CalendarEvent[] = [
      {
        ...base,
        uid: "a",
        summary: "A",
        start: "2026-06-17T09:00:00",
        end: "2026-06-17T10:00:00",
      },
      {
        ...base,
        uid: "b",
        summary: "B",
        start: "2026-06-17T11:00:00",
        end: "2026-06-17T12:00:00",
      },
    ];
    const layouts = layoutTimedEventsOnDay(events, "2026-06-17");
    expect(layouts.every((item) => item.widthPercent === 100 && item.leftPercent === 0)).toBe(true);
  });

  it("maps local time to grid offset", () => {
    const at1030 = new Date("2026-06-17T10:30:00");
    expect(getNowIndicatorTopPx(at1030)).toBe(10.5 * 48);
  });

  it("maps grid offset to snapped local start time", () => {
    const day = new Date("2026-06-17T00:00:00");
    const at10h = 10 * 48;
    const start = dateFromGridOffsetPx(at10h, day);
    expect(start.getHours()).toBe(10);
    expect(start.getMinutes()).toBe(0);
  });

  it("snaps grid click offset to 15-minute intervals", () => {
    const day = new Date("2026-06-17T00:00:00");
    const offsetPx = 10.4 * 48;
    const start = dateFromGridOffsetPx(offsetPx, day);
    expect(start.getHours()).toBe(10);
    expect(start.getMinutes()).toBe(30);
  });
});
