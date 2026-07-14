/** Calendar client for the IAM-authenticated local Workspace API. */

import { WorkspaceApiHttpError, workspaceOrvalMutator } from "~/shared/api/workspace-orval-mutator";
import { createMessageId } from "~/shared/lib/message-id.lib";
import { buildIcsFromInput, expandRecurringEvents, parseVeventFromIcs } from "./calendar-ical.lib";
import { parseCalendarEventInput } from "./calendar-validation.lib";
import type {
  CalendarAlarm,
  CalendarAttendee,
  CalendarEvent,
  CalendarEventInput,
  CalendarInfo,
} from "./calendar.types";

export { WorkspaceApiHttpError as CalendarApiError };

interface WorkspaceCalendar {
  uuid: string;
  name: string;
  color: string | null;
  ctag: string | null;
}

interface WorkspaceCalendarEvent {
  uuid: string;
  calendar_uuid: string;
  uid: string;
  summary: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  etag: string | null;
  recurrence: { rrule?: string | null } | null;
  attendees: {
    email: string;
    name?: string | null;
    status?: string | null;
    role?: string | null;
  }[];
  alarms: {
    action?: string;
    trigger?: string;
    triggerMinutes?: number | null;
    triggerAbsolute?: string | null;
  }[];
  recurrence_id: string | null;
}

const eventResourceIds = new Map<string, string>();
let calendarExternalUserIdPromise: Promise<string | null> | undefined;

function eventKey(calendarId: string, uid: string): string {
  return `${calendarId}:${uid}`;
}

function query(params: Record<string, string | number | undefined>): string {
  const values = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined) values.set(name, String(value));
  }
  const encoded = values.toString();
  return encoded.length > 0 ? `?${encoded}` : "";
}

async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  return workspaceOrvalMutator<T>(path, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
}

async function resolveCalendarExternalUserId(): Promise<string | null> {
  calendarExternalUserIdPromise ??= request<{ uuid?: string }[]>(
    "/v1/external_users/?account_type=calendar",
  ).then((accounts) => accounts.find((account) => typeof account.uuid === "string")?.uuid ?? null);
  return calendarExternalUserIdPromise;
}

function mapCalendar(calendar: WorkspaceCalendar): CalendarInfo {
  return {
    id: calendar.uuid,
    displayName: calendar.name,
    color: calendar.color,
    ctag: calendar.ctag,
  };
}

function parseAlarmTrigger(trigger: string | undefined): number | null {
  if (trigger == null) return null;
  const match = /^-PT(\d+)M$/i.exec(trigger);
  return match?.[1] == null ? null : Number(match[1]);
}

function mapAttendee(attendee: WorkspaceCalendarEvent["attendees"][number]): CalendarAttendee {
  return {
    email: attendee.email,
    displayName: attendee.name ?? null,
    partstat: attendee.status ?? null,
    role: attendee.role ?? null,
  };
}

function mapAlarm(alarm: WorkspaceCalendarEvent["alarms"][number]): CalendarAlarm {
  return {
    triggerMinutes: alarm.triggerMinutes ?? parseAlarmTrigger(alarm.trigger),
    triggerAbsolute: alarm.triggerAbsolute ?? null,
    action: alarm.action ?? "DISPLAY",
  };
}

function mapEvent(event: WorkspaceCalendarEvent): CalendarEvent {
  eventResourceIds.set(eventKey(event.calendar_uuid, event.uid), event.uuid);
  return {
    uid: event.uid,
    calendarId: event.calendar_uuid,
    summary: event.summary,
    description: event.description,
    location: event.location,
    start: event.starts_at,
    end: event.ends_at,
    allDay: event.all_day,
    etag: event.etag,
    recurrence: event.recurrence == null ? null : { rrule: event.recurrence.rrule ?? null },
    attendees: event.attendees.map(mapAttendee),
    alarms: event.alarms.map(mapAlarm),
    recurrenceId: event.recurrence_id,
    isRecurringInstance: false,
  };
}

function serializeAttendees(attendees: CalendarAttendee[] | undefined) {
  return (attendees ?? []).map((attendee) => ({
    email: attendee.email,
    name: attendee.displayName,
    status: attendee.partstat,
    role: attendee.role,
  }));
}

function serializeAlarms(alarms: CalendarAlarm[] | undefined) {
  return (alarms ?? []).map((alarm) => ({
    action: alarm.action,
    trigger: alarm.triggerMinutes == null ? alarm.triggerAbsolute : `-PT${alarm.triggerMinutes}M`,
  }));
}

async function resolveEventResourceId(calendarId: string, uid: string): Promise<string> {
  const key = eventKey(calendarId, uid);
  const cached = eventResourceIds.get(key);
  if (cached != null) return cached;
  const events = await request<WorkspaceCalendarEvent[]>(
    `/v1/calendar/events/${query({ calendar_uuid: calendarId, uid })}`,
  );
  const resource = events[0];
  if (resource == null) throw new Error("Calendar event not found");
  mapEvent(resource);
  return resource.uuid;
}

export async function fetchCalendars(_token: string): Promise<CalendarInfo[]> {
  const data = await request<WorkspaceCalendar[]>("/v1/calendar/calendars/");
  return data.map(mapCalendar);
}

export async function fetchCalendarEvents(
  _token: string,
  calendarIds: string[],
  start: string,
  end: string,
): Promise<CalendarEvent[]> {
  const pages = await Promise.all(
    calendarIds.map((calendarId) =>
      request<WorkspaceCalendarEvent[]>(
        `/v1/calendar/events/${query({ calendar_uuid: calendarId, page_limit: 1000 })}`,
      ),
    ),
  );
  const rangeStart = new Date(start).getTime();
  const rangeEnd = new Date(end).getTime();
  const masters = pages
    .flat()
    .map(mapEvent)
    .filter(
      (event) =>
        new Date(event.end).getTime() >= rangeStart && new Date(event.start).getTime() <= rangeEnd,
    );
  return expandRecurringEvents(masters, new Date(start), new Date(end));
}

export async function fetchCalendarEvent(
  _token: string,
  calendarId: string,
  eventUid: string,
): Promise<CalendarEvent> {
  const uuid = await resolveEventResourceId(calendarId, eventUid);
  return mapEvent(await request<WorkspaceCalendarEvent>(`/v1/calendar/events/${uuid}`));
}

function eventPayload(input: CalendarEventInput, uid: string) {
  return {
    calendar_uuid: input.calendarId,
    uid,
    summary: input.summary,
    description: input.description ?? null,
    location: input.location ?? null,
    starts_at: input.start,
    ends_at: input.end,
    all_day: input.allDay ?? false,
    recurrence: input.recurrence,
    attendees: serializeAttendees(input.attendees),
    alarms: serializeAlarms(input.alarms),
  };
}

export async function createCalendarEvent(
  _token: string,
  input: CalendarEventInput,
): Promise<CalendarEvent> {
  const parsed = parseCalendarEventInput(input);
  const uid = parsed.uid ?? createMessageId();
  const event = await request<WorkspaceCalendarEvent>(
    "/v1/calendar/events/",
    "POST",
    eventPayload(parsed, uid),
  );
  return mapEvent(event);
}

export async function updateCalendarEvent(
  _token: string,
  eventUid: string,
  input: CalendarEventInput,
): Promise<CalendarEvent> {
  const parsed = parseCalendarEventInput(input);
  const uuid = await resolveEventResourceId(parsed.calendarId, eventUid);
  const event = await request<WorkspaceCalendarEvent>(
    `/v1/calendar/events/${uuid}`,
    "PUT",
    eventPayload(parsed, eventUid),
  );
  return mapEvent(event);
}

export async function deleteCalendarEvent(
  _token: string,
  calendarId: string,
  eventUid: string,
  _options: {
    recurrenceId?: string | null;
    scope?: "this" | "thisAndFuture" | "all";
    masterEvent?: CalendarEvent;
  } = {},
): Promise<void> {
  const uuid = await resolveEventResourceId(calendarId, eventUid);
  await request<void>(`/v1/calendar/events/${uuid}`, "DELETE");
  eventResourceIds.delete(eventKey(calendarId, eventUid));
}

export async function createCalendarCollection(
  _token: string,
  displayName: string,
  color?: string | null,
): Promise<CalendarInfo> {
  const externalUserUuid = await resolveCalendarExternalUserId();
  return mapCalendar(
    await request<WorkspaceCalendar>("/v1/calendar/calendars/", "POST", {
      name: displayName,
      color: color ?? null,
      ...(externalUserUuid == null ? {} : { external_user_uuid: externalUserUuid }),
    }),
  );
}

export async function updateCalendarCollection(
  _token: string,
  calendarId: string,
  displayName?: string,
  color?: string | null,
): Promise<CalendarInfo> {
  return mapCalendar(
    await request<WorkspaceCalendar>(`/v1/calendar/calendars/${calendarId}`, "PUT", {
      ...(displayName === undefined ? {} : { name: displayName }),
      ...(color === undefined ? {} : { color }),
    }),
  );
}

export async function deleteCalendarCollection(_token: string, calendarId: string): Promise<void> {
  await request<void>(`/v1/calendar/calendars/${calendarId}`, "DELETE");
}

export async function moveCalendarEventToCalendar(
  _token: string,
  eventUid: string,
  fromCalendarId: string,
  toCalendarId: string,
): Promise<CalendarEvent> {
  const uuid = await resolveEventResourceId(fromCalendarId, eventUid);
  const event = await request<WorkspaceCalendarEvent>(
    `/v1/calendar/events/${uuid}/actions/move/invoke`,
    "POST",
    { calendar_uuid: toCalendarId },
  );
  eventResourceIds.delete(eventKey(fromCalendarId, eventUid));
  return mapEvent(event);
}

export async function searchCalendarEvents(
  token: string,
  calendarIds: string[],
  start: string,
  end: string,
  search: string,
): Promise<CalendarEvent[]> {
  const normalized = search.trim().toLocaleLowerCase();
  const events = await fetchCalendarEvents(token, calendarIds, start, end);
  return events.filter((event) =>
    [event.summary, event.description ?? "", event.location ?? ""].some((value) =>
      value.toLocaleLowerCase().includes(normalized),
    ),
  );
}

export async function importCalendarEventIcs(
  token: string,
  calendarId: string,
  ics: string,
): Promise<CalendarEvent> {
  const parsed = parseVeventFromIcs(ics, calendarId, null)[0];
  if (parsed == null) throw new Error("ICS does not contain an event");
  return createCalendarEvent(token, parsed);
}

export async function exportCalendarEventIcs(
  token: string,
  calendarId: string,
  eventUid: string,
): Promise<string> {
  const event = await fetchCalendarEvent(token, calendarId, eventUid);
  return buildIcsFromInput(event, event.uid);
}

export async function fetchCalendarFreeBusy(
  token: string,
  start: string,
  end: string,
  emails: string[],
): Promise<{ email: string; busy: { start: string; end: string }[] }[]> {
  const calendars = await fetchCalendars(token);
  const events = await fetchCalendarEvents(
    token,
    calendars.map((calendar) => calendar.id),
    start,
    end,
  );
  return emails.map((email) => ({
    email,
    busy: events
      .filter((event) => event.attendees.some((attendee) => attendee.email === email))
      .map((event) => ({ start: event.start, end: event.end })),
  }));
}
