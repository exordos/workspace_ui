/**
 * Human-readable labels for calendar event detail panels.
 */

import { t } from "~/i18n/i18n";
import { formatRecurrenceLabel } from "./calendar-recurrence.lib";
import { addDays, parseLocalDate, toIsoDate } from "./calendar.lib";
import type { CalendarAlarm, CalendarAttendee, CalendarEvent } from "./calendar.types";

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
};

const TIME_FORMAT: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
};

function isSameLocalDay(a: Date, b: Date): boolean {
  return toIsoDate(a) === toIsoDate(b);
}

function formatAllDayWhen(event: CalendarEvent): { dateLine: string; timeLine: string } {
  const startIso = event.start.slice(0, 10);
  const endIso = event.end.slice(0, 10);
  const startDate = parseLocalDate(startIso);
  const dateLine = startDate.toLocaleDateString(undefined, DATE_FORMAT);

  if (endIso <= startIso) {
    return { dateLine, timeLine: t("calendar.allDay") };
  }

  const lastInclusive = addDays(parseLocalDate(endIso), -1);
  const endLine = lastInclusive.toLocaleDateString(undefined, DATE_FORMAT);
  return {
    dateLine: `${dateLine} – ${endLine}`,
    timeLine: t("calendar.allDay"),
  };
}

function formatTimedWhen(event: CalendarEvent): { dateLine: string; timeLine: string | null } {
  const start = new Date(event.start);
  const end = new Date(event.end);
  const startTime = start.toLocaleTimeString(undefined, TIME_FORMAT);
  const endTime = end.toLocaleTimeString(undefined, TIME_FORMAT);

  if (isSameLocalDay(start, end)) {
    return {
      dateLine: start.toLocaleDateString(undefined, DATE_FORMAT),
      timeLine: `${startTime} – ${endTime}`,
    };
  }

  return {
    dateLine: `${start.toLocaleString(undefined, { ...DATE_FORMAT, ...TIME_FORMAT })} – ${end.toLocaleString(undefined, { ...DATE_FORMAT, ...TIME_FORMAT })}`,
    timeLine: null,
  };
}

export function formatEventWhen(event: CalendarEvent): {
  dateLine: string;
  timeLine: string | null;
} {
  if (event.allDay) {
    const allDay = formatAllDayWhen(event);
    return { dateLine: allDay.dateLine, timeLine: allDay.timeLine };
  }
  return formatTimedWhen(event);
}

export function formatEventDuration(event: CalendarEvent): string | null {
  if (event.allDay) return null;
  const start = new Date(event.start).getTime();
  const end = new Date(event.end).getTime();
  const totalMinutes = Math.max(Math.round((end - start) / 60_000), 1);
  if (totalMinutes < 60) {
    return t("calendar.durationMinutes", { count: totalMinutes });
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) {
    return t("calendar.durationHours", { count: hours });
  }
  return t("calendar.durationHoursMinutes", { hours, minutes });
}

export { formatRecurrenceLabel };

export function formatAlarmLabel(alarm: CalendarAlarm): string {
  if (alarm.triggerMinutes != null) {
    const minutes = alarm.triggerMinutes;
    if (minutes === 5) return t("calendar.reminder5m");
    if (minutes === 15) return t("calendar.reminder15m");
    if (minutes === 60) return t("calendar.reminder1h");
    if (minutes === 1440) return t("calendar.reminder1d");
    if (minutes < 60) return t("calendar.reminderMinutesBefore", { count: minutes });
    if (minutes % 60 === 0) {
      return t("calendar.reminderHoursBefore", { count: minutes / 60 });
    }
    return t("calendar.reminderMinutesBefore", { count: minutes });
  }
  if (alarm.triggerAbsolute != null && alarm.triggerAbsolute.length > 0) {
    const at = new Date(alarm.triggerAbsolute);
    if (!Number.isNaN(at.getTime())) {
      return t("calendar.reminderAt", {
        datetime: at.toLocaleString(undefined, { ...DATE_FORMAT, ...TIME_FORMAT }),
      });
    }
  }
  return t("calendar.reminder");
}

export function formatAttendeePartstat(partstat: string | null | undefined): string | null {
  if (partstat == null || partstat.length === 0) return null;
  const key = partstat.toUpperCase();
  if (key === "ACCEPTED") return t("calendar.partstatAccepted");
  if (key === "DECLINED") return t("calendar.partstatDeclined");
  if (key === "TENTATIVE") return t("calendar.partstatTentative");
  if (key === "NEEDS-ACTION") return t("calendar.partstatNeedsAction");
  return partstat;
}

export function formatAttendeeLabel(attendee: CalendarAttendee): string {
  return attendee.displayName ?? attendee.email;
}
