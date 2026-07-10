/**
 * Calendar utilities — API config and grid date helpers.
 */

import { isMailApiConfigured } from "~/entities/mail/mail.lib";
import type { CalendarEvent } from "./calendar.types";

export function isCalendarApiConfigured(configuredOrigin: string): boolean {
  return isMailApiConfigured(configuredOrigin);
}

export function isCalendarUnauthorizedError(error: unknown): boolean {
  if (typeof error === "object" && error != null && "status" in error) {
    const status = error.status;
    if (status === 401) return true;
  }
  return error instanceof Error && error.message.toLowerCase() === "unauthorized";
}

export interface CalendarDayCell {
  date: Date;
  inCurrentMonth: boolean;
  isoDate: string;
}

export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Local calendar date (no time) from YYYY-MM-DD. */
export function parseLocalDate(isoDate: string): Date {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  return new Date(y!, m! - 1, d);
}

const MINUTES_PER_DAY = 24 * 60;

/** Pixel height of one hour row in week/day time grids. */
export const CALENDAR_HOUR_HEIGHT_PX = 48;

/** Minimum rendered height for very short timed events. */
export const CALENDAR_MIN_EVENT_HEIGHT_PX = 12;

/** Minutes elapsed since local midnight for a clock time. */
export function getMinutesFromDayStart(date: Date): number {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

/** Map local time to vertical offset in the hour grid. */
export function minutesToGridTopPx(
  minutes: number,
  hourHeightPx = CALENDAR_HOUR_HEIGHT_PX,
): number {
  return (minutes / 60) * hourHeightPx;
}

export function getNowIndicatorTopPx(now: Date, hourHeightPx = CALENDAR_HOUR_HEIGHT_PX): number {
  return minutesToGridTopPx(getMinutesFromDayStart(now), hourHeightPx);
}

/** Default snap interval when creating an event from a time-grid click. */
export const CALENDAR_TIME_SLOT_SNAP_MINUTES = 15;

export function snapMinutesToInterval(
  minutes: number,
  interval = CALENDAR_TIME_SLOT_SNAP_MINUTES,
): number {
  return Math.round(minutes / interval) * interval;
}

/** Map a vertical offset inside a day column to a local start time (snapped). */
export function dateFromGridOffsetPx(
  offsetPx: number,
  day: Date,
  hourHeightPx = CALENDAR_HOUR_HEIGHT_PX,
  snapMinutes = CALENDAR_TIME_SLOT_SNAP_MINUTES,
): Date {
  const rawMinutes = (offsetPx / hourHeightPx) * 60;
  const clamped = Math.min(Math.max(rawMinutes, 0), MINUTES_PER_DAY);
  const snapped = Math.min(
    snapMinutesToInterval(clamped, snapMinutes),
    MINUTES_PER_DAY - snapMinutes,
  );
  const result = new Date(day);
  result.setHours(0, 0, 0, 0);
  result.setMinutes(snapped);
  return result;
}

export function formatLocalTimeHHmm(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export interface TimedEventLayout {
  event: CalendarEvent;
  topPx: number;
  heightPx: number;
  leftPercent: number;
  widthPercent: number;
}

interface TimedEventLayoutDraft {
  event: CalendarEvent;
  startMs: number;
  endMs: number;
  topPx: number;
  heightPx: number;
  column: number;
}

function timedEventsOverlap(a: TimedEventLayoutDraft, b: TimedEventLayoutDraft): boolean {
  return a.startMs < b.endMs && b.startMs < a.endMs;
}

function assignTimedEventColumns(drafts: TimedEventLayoutDraft[]): void {
  const sorted = [...drafts].sort((a, b) => {
    if (a.startMs !== b.startMs) return a.startMs - b.startMs;
    return b.endMs - b.startMs - (a.endMs - a.startMs);
  });
  const columnEnds: number[] = [];

  for (const draft of sorted) {
    let column = columnEnds.findIndex((endMs) => endMs <= draft.startMs);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(draft.endMs);
    } else {
      columnEnds[column] = draft.endMs;
    }
    draft.column = column;
  }
}

function applyTimedEventOverlapWidths(drafts: TimedEventLayoutDraft[]): TimedEventLayout[] {
  return drafts.map((draft) => {
    const overlapping = drafts.filter((other) => timedEventsOverlap(draft, other));
    const totalColumns = Math.max(...overlapping.map((item) => item.column), draft.column) + 1;
    const widthPercent = 100 / totalColumns;
    return {
      event: draft.event,
      topPx: draft.topPx,
      heightPx: draft.heightPx,
      leftPercent: draft.column * widthPercent,
      widthPercent,
    };
  });
}

export function layoutTimedEventsOnDay(
  events: readonly CalendarEvent[],
  isoDate: string,
  hourHeightPx = CALENDAR_HOUR_HEIGHT_PX,
): TimedEventLayout[] {
  const dayStartMs = parseLocalDate(isoDate).getTime();
  const dayEndMs = dayStartMs + MINUTES_PER_DAY * 60 * 1000;

  const drafts: TimedEventLayoutDraft[] = events
    .filter((event) => !event.allDay && eventOccursOnDay(event, isoDate))
    .map((event) => {
      const eventStartMs = new Date(event.start).getTime();
      const eventEndMs = new Date(event.end).getTime();
      const startMs = Math.max(eventStartMs, dayStartMs);
      const endMs = Math.min(eventEndMs, dayEndMs);
      const startMin = (startMs - dayStartMs) / (60 * 1000);
      const durationMin = Math.max((endMs - startMs) / (60 * 1000), 1);
      return {
        event,
        startMs,
        endMs,
        topPx: (startMin / 60) * hourHeightPx,
        heightPx: Math.max((durationMin / 60) * hourHeightPx, CALENDAR_MIN_EVENT_HEIGHT_PX),
        column: 0,
      };
    });

  assignTimedEventColumns(drafts);
  return applyTimedEventOverlapWidths(drafts);
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function startOfWeek(date: Date, weekStartsOn = 1): Date {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = (day - weekStartsOn + 7) % 7;
  return addDays(d, -diff);
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date): Date {
  return endOfDay(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

export function buildMonthGrid(anchor: Date, weekStartsOn = 1): CalendarDayCell[] {
  const monthStart = startOfMonth(anchor);
  const gridStart = startOfWeek(monthStart, weekStartsOn);
  const cells: CalendarDayCell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const date = addDays(gridStart, i);
    cells.push({
      date,
      inCurrentMonth: date.getMonth() === anchor.getMonth(),
      isoDate: toIsoDate(date),
    });
  }
  return cells;
}

export function buildWeekDays(anchor: Date, weekStartsOn = 1): Date[] {
  const start = startOfWeek(anchor, weekStartsOn);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function eventOccursOnDay(event: CalendarEvent, isoDate: string): boolean {
  if (event.allDay) {
    const startDate = event.start.slice(0, 10);
    const endDate = event.end.slice(0, 10);
    // RFC 5545 exclusive DTEND; SOGo may emit DTEND === DTSTART for single-day events
    if (endDate <= startDate) {
      return isoDate === startDate;
    }
    return startDate <= isoDate && endDate > isoDate;
  }
  const dayStart = parseLocalDate(isoDate);
  const dayEnd = endOfDay(dayStart);
  const eventStart = new Date(event.start);
  const eventEnd = new Date(event.end);
  return eventStart <= dayEnd && eventEnd >= dayStart;
}

export function sortEventsByStart(events: readonly CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => {
    const aTime = a.allDay ? a.start.slice(0, 10) : a.start;
    const bTime = b.allDay ? b.start.slice(0, 10) : b.start;
    return aTime.localeCompare(bTime);
  });
}

export function buildEventsByDay(
  events: readonly CalendarEvent[],
  isoDates: readonly string[],
): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const isoDate of isoDates) {
    map.set(
      isoDate,
      events.filter((event) => eventOccursOnDay(event, isoDate)),
    );
  }
  return map;
}

export function defaultCalendarColor(index: number): string {
  const palette = [
    "var(--accent)",
    "var(--presence-online)",
    "var(--presence-idle)",
    "var(--presence-offline)",
  ];
  return palette[index % palette.length] ?? "var(--accent)";
}
