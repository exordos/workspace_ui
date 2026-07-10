/**
 * Calendar event payload validation — client-side before CalDAV transport calls.
 */

import type { CalendarEventInput } from "@mail/api/mail-api.generated";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function parseCalendarIdsQuery(value: unknown): string[] {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("calendarId query parameter is required");
  }
  return value
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

export function parseIsoDateQuery(value: unknown, label: string): string {
  if (!isNonEmptyString(value)) {
    throw new Error(`${label} query parameter is required`);
  }
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parsed = Date.parse(`${trimmed}T00:00:00.000Z`);
    if (!Number.isFinite(parsed)) {
      throw new Error(`${label} must be a valid ISO date`);
    }
    return new Date(parsed).toISOString();
  }
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a valid ISO date`);
  }
  return new Date(parsed).toISOString();
}

export function parseEventUidParam(value: unknown): string {
  if (!isNonEmptyString(value)) {
    throw new Error("eventUid is required");
  }
  return value.trim();
}

export function parseCalendarEventInput(body: unknown): CalendarEventInput {
  if (body == null || typeof body !== "object") {
    throw new Error("Invalid event payload");
  }
  const record = body as Record<string, unknown>;
  if (!isNonEmptyString(record.calendarId)) {
    throw new Error("calendarId is required");
  }
  if (!isNonEmptyString(record.summary)) {
    throw new Error("summary is required");
  }
  if (!isNonEmptyString(record.start) || !isNonEmptyString(record.end)) {
    throw new Error("start and end are required");
  }

  return {
    calendarId: record.calendarId.trim(),
    uid: isNonEmptyString(record.uid) ? record.uid.trim() : undefined,
    summary: record.summary.trim(),
    description: isNonEmptyString(record.description) ? record.description : null,
    location: isNonEmptyString(record.location) ? record.location : null,
    start: new Date(record.start).toISOString(),
    end: new Date(record.end).toISOString(),
    allDay: record.allDay === true,
    recurrence:
      record.recurrence != null && typeof record.recurrence === "object"
        ? {
            rrule: isNonEmptyString((record.recurrence as Record<string, unknown>).rrule)
              ? String((record.recurrence as Record<string, unknown>).rrule)
              : null,
          }
        : null,
    attendees: Array.isArray(record.attendees)
      ? record.attendees
          .filter((a): a is Record<string, unknown> => a != null && typeof a === "object")
          .map((a) => ({
            email: isNonEmptyString(a.email) ? a.email.trim() : "",
            displayName: isNonEmptyString(a.displayName) ? a.displayName : null,
            partstat: isNonEmptyString(a.partstat) ? a.partstat : null,
            role: isNonEmptyString(a.role) ? a.role : null,
          }))
          .filter((a) => a.email.length > 0)
      : [],
    alarms: Array.isArray(record.alarms)
      ? record.alarms
          .filter((a): a is Record<string, unknown> => a != null && typeof a === "object")
          .map((a) => ({
            triggerMinutes:
              typeof a.triggerMinutes === "number" && Number.isFinite(a.triggerMinutes)
                ? a.triggerMinutes
                : null,
            triggerAbsolute: isNonEmptyString(a.triggerAbsolute) ? a.triggerAbsolute : null,
            action: isNonEmptyString(a.action) ? a.action : "DISPLAY",
          }))
      : [],
    etag: isNonEmptyString(record.etag) ? record.etag : null,
  };
}
