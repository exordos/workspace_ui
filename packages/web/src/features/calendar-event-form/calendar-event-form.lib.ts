/**
 * Calendar event form state builders and RRULE presets.
 */

import { toIsoDate } from "~/entities/calendar/calendar.lib";
import type { CalendarEvent, CalendarEventInput } from "~/entities/calendar/calendar.types";
import type { CalendarEventFormState, RecurrencePreset } from "./calendar-event-form.types";

export function recurrencePresetToRrule(preset: RecurrencePreset, custom: string): string | null {
  if (preset === "none") return null;
  if (preset === "custom") return custom.trim().length > 0 ? custom.trim() : null;
  if (preset === "daily") return "FREQ=DAILY";
  if (preset === "weekly") return "FREQ=WEEKLY";
  if (preset === "monthly") return "FREQ=MONTHLY";
  return null;
}

export function detectRecurrencePreset(rrule: string | null | undefined): {
  preset: RecurrencePreset;
  custom: string;
} {
  if (rrule == null || rrule.length === 0) return { preset: "none", custom: "" };
  const normalized = rrule.replace(/^RRULE:/i, "");
  if (normalized === "FREQ=DAILY") return { preset: "daily", custom: "" };
  if (normalized === "FREQ=WEEKLY") return { preset: "weekly", custom: "" };
  if (normalized === "FREQ=MONTHLY") return { preset: "monthly", custom: "" };
  return { preset: "custom", custom: normalized };
}

export function buildDefaultFormState(
  calendars: { id: string }[],
  focusDate: Date,
  initialEvent: CalendarEvent | null,
): CalendarEventFormState {
  const defaultCalendarId = initialEvent?.calendarId ?? calendars[0]?.id ?? "personal";
  const iso = toIsoDate(focusDate);
  if (initialEvent != null) {
    const start = initialEvent.allDay
      ? initialEvent.start.slice(0, 10)
      : new Date(initialEvent.start).toISOString().slice(0, 10);
    const end = initialEvent.allDay
      ? initialEvent.end.slice(0, 10)
      : new Date(initialEvent.end).toISOString().slice(0, 10);
    const recurrence = detectRecurrencePreset(initialEvent.recurrence?.rrule);
    return {
      calendarId: initialEvent.calendarId,
      summary: initialEvent.summary,
      description: initialEvent.description ?? "",
      location: initialEvent.location ?? "",
      startDate: start,
      startTime: initialEvent.allDay
        ? "09:00"
        : new Date(initialEvent.start).toISOString().slice(11, 16),
      endDate: end,
      endTime: initialEvent.allDay
        ? "10:00"
        : new Date(initialEvent.end).toISOString().slice(11, 16),
      allDay: initialEvent.allDay,
      recurrencePreset: recurrence.preset,
      customRrule: recurrence.custom,
      attendeeEmail: "",
      attendeeName: "",
      attendees: initialEvent.attendees,
      reminderMinutes: initialEvent.alarms[0]?.triggerMinutes?.toString() ?? "",
      alarms: initialEvent.alarms,
    };
  }
  return {
    calendarId: defaultCalendarId,
    summary: "",
    description: "",
    location: "",
    startDate: iso,
    startTime: "09:00",
    endDate: iso,
    endTime: "10:00",
    allDay: false,
    recurrencePreset: "none",
    customRrule: "",
    attendeeEmail: "",
    attendeeName: "",
    attendees: [],
    reminderMinutes: "15",
    alarms: [{ triggerMinutes: 15, triggerAbsolute: null, action: "DISPLAY" }],
  };
}

export function formStateToEventInput(state: CalendarEventFormState): CalendarEventInput {
  const start = state.allDay
    ? `${state.startDate}T00:00:00.000Z`
    : new Date(`${state.startDate}T${state.startTime}:00`).toISOString();
  const end = state.allDay
    ? `${state.endDate}T00:00:00.000Z`
    : new Date(`${state.endDate}T${state.endTime}:00`).toISOString();
  const rrule = recurrencePresetToRrule(state.recurrencePreset, state.customRrule);
  const alarms =
    state.reminderMinutes.trim().length > 0
      ? [
          {
            triggerMinutes: Number.parseInt(state.reminderMinutes, 10),
            triggerAbsolute: null,
            action: "DISPLAY",
          },
        ]
      : state.alarms;

  return {
    calendarId: state.calendarId,
    summary: state.summary.trim(),
    description: state.description.trim().length > 0 ? state.description.trim() : null,
    location: state.location.trim().length > 0 ? state.location.trim() : null,
    start,
    end,
    allDay: state.allDay,
    recurrence: rrule != null ? { rrule } : null,
    attendees: state.attendees,
    alarms,
  };
}
