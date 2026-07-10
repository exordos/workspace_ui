/**
 * Calendar REST client — iCal parsing/serialization on client, CalDAV transport via @mail/api.
 */

import {
  createCalendar as apiCreateCalendar,
  createCalendarEvent as apiCreateCalendarEvent,
  deleteCalendar as apiDeleteCalendar,
  deleteCalendarEvent as apiDeleteCalendarEvent,
  exportCalendarEvent as apiExportCalendarEvent,
  getCalendarEvent as apiGetCalendarEvent,
  importCalendarEvent as apiImportCalendarEvent,
  listCalendars as apiListCalendars,
  moveCalendarEvent as apiMoveCalendarEvent,
  queryCalendarEvents as apiQueryCalendarEvents,
  queryCalendarFreeBusy as apiQueryCalendarFreeBusy,
  searchCalendarEvents as apiSearchCalendarEvents,
  updateCalendar as apiUpdateCalendar,
  updateCalendarEvent as apiUpdateCalendarEvent,
  type CalendarEventScope,
  type CalendarIcsResource,
} from "@mail/api/mail-api.generated";
import { MailApiHttpError, mailApiAuthOptions } from "~/shared/api/mail-orval-mutator";
import {
  buildIcsFromInput,
  buildIcsWithExdate,
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
  let etagForUpdate: string | null | undefined = parsed.etag;

  try {
    const existing = await apiGetCalendarEvent(
      eventUid,
      { calendarId: parsed.calendarId },
      mailApiAuthOptions(token),
    );
    ics = mergeEventInputWithExisting(existing.ics, { ...parsed, uid: eventUid }, eventUid);
    etagForUpdate = existing.etag ?? etagForUpdate;
  } catch {
    /* Fall back to freshly built ICS when the current resource cannot be loaded. */
  }

  const resource = await apiUpdateCalendarEvent(
    eventUid,
    {
      calendarId: parsed.calendarId,
      ics,
      ...(etagForUpdate != null && etagForUpdate.length > 0 ? { etag: etagForUpdate } : {}),
    },
    mailApiAuthOptions(token),
  );
  return parseIcsResourceFirst(resource);
}

export async function deleteCalendarEvent(
  token: string,
  calendarId: string,
  eventUid: string,
  options: {
    recurrenceId?: string | null;
    scope?: CalendarEventScope;
    masterEvent?: CalendarEvent;
  } = {},
): Promise<void> {
  const scope = options.scope ?? "all";
  if (scope === "this" && options.recurrenceId != null && options.masterEvent != null) {
    const ics = buildIcsWithExdate(options.masterEvent, options.recurrenceId);
    await apiUpdateCalendarEvent(
      eventUid,
      { calendarId, ics, etag: options.masterEvent.etag ?? undefined },
      mailApiAuthOptions(token),
    );
    return;
  }
  await apiDeleteCalendarEvent(
    eventUid,
    {
      calendarId,
      ...(options.recurrenceId != null ? { recurrenceId: options.recurrenceId } : {}),
      ...(options.scope != null ? { scope: options.scope } : {}),
    },
    mailApiAuthOptions(token),
  );
}

export async function createCalendarCollection(
  token: string,
  displayName: string,
  color?: string | null,
): Promise<CalendarInfo> {
  return apiCreateCalendar({ displayName, color: color ?? undefined }, mailApiAuthOptions(token));
}

export async function updateCalendarCollection(
  token: string,
  calendarId: string,
  displayName?: string,
  color?: string | null,
): Promise<CalendarInfo> {
  return apiUpdateCalendar(calendarId, { displayName, color }, mailApiAuthOptions(token));
}

export async function deleteCalendarCollection(token: string, calendarId: string): Promise<void> {
  await apiDeleteCalendar(calendarId, mailApiAuthOptions(token));
}

export async function moveCalendarEventToCalendar(
  token: string,
  eventUid: string,
  fromCalendarId: string,
  toCalendarId: string,
): Promise<CalendarEvent> {
  const resource = await apiMoveCalendarEvent(
    eventUid,
    { fromCalendarId, toCalendarId },
    mailApiAuthOptions(token),
  );
  return parseIcsResourceFirst(resource);
}

export async function searchCalendarEvents(
  token: string,
  calendarIds: string[],
  start: string,
  end: string,
  query: string,
): Promise<CalendarEvent[]> {
  const data = await apiSearchCalendarEvents(
    { calendarId: calendarIds.join(","), start, end, q: query },
    mailApiAuthOptions(token),
  );
  const masters = data.items.flatMap((item) => parseIcsResource(item));
  return expandRecurringEvents(masters, new Date(start), new Date(end));
}

export async function importCalendarEventIcs(
  token: string,
  calendarId: string,
  ics: string,
): Promise<CalendarEvent> {
  const resource = await apiImportCalendarEvent({ calendarId, ics }, mailApiAuthOptions(token));
  return parseIcsResourceFirst(resource);
}

export async function exportCalendarEventIcs(
  token: string,
  calendarId: string,
  eventUid: string,
): Promise<string> {
  return apiExportCalendarEvent(eventUid, { calendarId }, mailApiAuthOptions(token));
}

export async function fetchCalendarFreeBusy(
  token: string,
  start: string,
  end: string,
  emails: string[],
): Promise<{ email: string; busy: { start: string; end: string }[] }[]> {
  const data = await apiQueryCalendarFreeBusy(
    { start, end, emails: emails.join(",") },
    mailApiAuthOptions(token),
  );
  return data.entries;
}
