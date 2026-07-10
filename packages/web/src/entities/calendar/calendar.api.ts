/**
 * Calendar REST client — iCal parsing/serialization on client, CalDAV transport via @mail/api.
 */

import {
  createCalendarEvent as apiCreateCalendarEvent,
  deleteCalendarEvent as apiDeleteCalendarEvent,
  getCalendarEvent as apiGetCalendarEvent,
  listCalendars as apiListCalendars,
  queryCalendarEvents as apiQueryCalendarEvents,
  updateCalendarEvent as apiUpdateCalendarEvent,
  type CalendarIcsResource,
} from "@mail/api/mail-api.generated";
import { MailApiHttpError, mailApiAuthOptions } from "~/shared/api/mail-orval-mutator";
import {
  buildIcsFromInput,
  expandRecurringEvents,
  mergeEventInputWithExisting,
  parseVeventFromIcs,
} from "./calendar-ical.lib";
import { parseCalendarEventInput } from "./calendar-validation.lib";
import type { CalendarEvent, CalendarEventInput, CalendarInfo } from "./calendar.types";

export { MailApiHttpError as CalendarApiError };

function parseIcsResource(resource: CalendarIcsResource): CalendarEvent[] {
  return parseVeventFromIcs(resource.ics, resource.calendarId, resource.etag ?? null);
}

function parseIcsResourceFirst(resource: CalendarIcsResource): CalendarEvent {
  const events = parseIcsResource(resource);
  const event = events[0];
  if (event == null) {
    throw new Error("Event not found in ICS");
  }
  return event;
}

export async function fetchCalendars(token: string): Promise<CalendarInfo[]> {
  const data = await apiListCalendars(mailApiAuthOptions(token));
  return data.calendars;
}

export async function fetchCalendarEvents(
  token: string,
  calendarIds: string[],
  start: string,
  end: string,
): Promise<CalendarEvent[]> {
  const data = await apiQueryCalendarEvents(
    {
      calendarId: calendarIds.join(","),
      start,
      end,
    },
    mailApiAuthOptions(token),
  );
  const masters = data.items.flatMap((item) => parseIcsResource(item));
  return expandRecurringEvents(masters, new Date(start), new Date(end));
}

export async function fetchCalendarEvent(
  token: string,
  calendarId: string,
  eventUid: string,
): Promise<CalendarEvent> {
  const resource = await apiGetCalendarEvent(eventUid, { calendarId }, mailApiAuthOptions(token));
  return parseIcsResourceFirst(resource);
}

export async function createCalendarEvent(
  token: string,
  input: CalendarEventInput,
): Promise<CalendarEvent> {
  const parsed = parseCalendarEventInput(input);
  const uid = parsed.uid ?? crypto.randomUUID();
  const ics = buildIcsFromInput({ ...parsed, uid }, uid);
  const resource = await apiCreateCalendarEvent(
    { calendarId: parsed.calendarId, ics },
    mailApiAuthOptions(token),
  );
  return parseIcsResourceFirst(resource);
}

export async function updateCalendarEvent(
  token: string,
  eventUid: string,
  input: CalendarEventInput,
): Promise<CalendarEvent> {
  const parsed = parseCalendarEventInput(input);
  let ics = buildIcsFromInput({ ...parsed, uid: eventUid }, eventUid);
  if (parsed.etag != null) {
    try {
      const existing = await apiGetCalendarEvent(
        eventUid,
        { calendarId: parsed.calendarId },
        mailApiAuthOptions(token),
      );
      ics = mergeEventInputWithExisting(existing.ics, { ...parsed, uid: eventUid }, eventUid);
    } catch {
      /* use freshly built ICS when existing fetch fails */
    }
  }
  const resource = await apiUpdateCalendarEvent(
    eventUid,
    {
      calendarId: parsed.calendarId,
      ics,
      ...(parsed.etag != null ? { etag: parsed.etag } : {}),
    },
    mailApiAuthOptions(token),
  );
  return parseIcsResourceFirst(resource);
}

export async function deleteCalendarEvent(
  token: string,
  calendarId: string,
  eventUid: string,
): Promise<void> {
  await apiDeleteCalendarEvent(eventUid, { calendarId }, mailApiAuthOptions(token));
}
