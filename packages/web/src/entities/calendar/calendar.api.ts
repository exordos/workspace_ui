/**
 * Calendar REST client — thin wrapper over Orval-generated @mail/api client.
 */

import {
  createCalendarEvent as apiCreateCalendarEvent,
  deleteCalendarEvent as apiDeleteCalendarEvent,
  getCalendarEvent as apiGetCalendarEvent,
  listCalendars as apiListCalendars,
  queryCalendarEvents as apiQueryCalendarEvents,
  updateCalendarEvent as apiUpdateCalendarEvent,
} from "@mail/api/mail-api.generated";
import { MailApiHttpError, mailApiAuthOptions } from "~/shared/api/mail-orval-mutator";
import type { CalendarEvent, CalendarEventInput, CalendarInfo } from "./calendar.types";

export { MailApiHttpError as CalendarApiError };

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
  return data.events;
}

export async function fetchCalendarEvent(
  token: string,
  calendarId: string,
  eventUid: string,
): Promise<CalendarEvent> {
  const data = await apiGetCalendarEvent(eventUid, { calendarId }, mailApiAuthOptions(token));
  return data.event;
}

export async function createCalendarEvent(
  token: string,
  input: CalendarEventInput,
): Promise<CalendarEvent> {
  const data = await apiCreateCalendarEvent(input, mailApiAuthOptions(token));
  return data.event;
}

export async function updateCalendarEvent(
  token: string,
  eventUid: string,
  input: CalendarEventInput,
): Promise<CalendarEvent> {
  const data = await apiUpdateCalendarEvent(eventUid, input, mailApiAuthOptions(token));
  return data.event;
}

export async function deleteCalendarEvent(
  token: string,
  calendarId: string,
  eventUid: string,
): Promise<void> {
  await apiDeleteCalendarEvent(eventUid, { calendarId }, mailApiAuthOptions(token));
}
