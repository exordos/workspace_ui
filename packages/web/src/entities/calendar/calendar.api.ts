/**
 * Calendar REST client — talks to mail-proxy (/v1/calendar/*).
 */

import { getMailApiBase } from "~/entities/mail/mail.lib";
import { env } from "~/shared/lib/env";
import { logApiCall } from "~/shared/lib/logger";
import type { CalendarEvent, CalendarEventInput, CalendarInfo } from "./calendar.types";

export class CalendarApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "CalendarApiError";
    this.status = status;
  }
}

function resolveBaseUrl(): string {
  return getMailApiBase(env.MAIL_API_ORIGIN);
}

async function calendarFetch<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const base = resolveBaseUrl();
  if (base.length === 0) {
    throw new Error("Calendar API is not configured");
  }
  const { token, ...fetchOptions } = options;
  const headers = new Headers(fetchOptions.headers);
  headers.set("Accept", "application/json");
  if (token != null && token.length > 0) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (fetchOptions.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const started = performance.now();
  let response: Response;
  try {
    response = await fetch(url, { ...fetchOptions, headers });
  } catch (error) {
    logApiCall(fetchOptions.method ?? "GET", path, {
      error: String(error),
      durationMs: Math.round(performance.now() - started),
    });
    throw error;
  }

  const durationMs = Math.round(performance.now() - started);
  logApiCall(fetchOptions.method ?? "GET", path, { status: response.status, durationMs });

  if (!response.ok) {
    let message = `Calendar API error (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (typeof body.error === "string" && body.error.length > 0) {
        message = body.error;
      }
    } catch {
      /* ignore parse errors */
    }
    throw new CalendarApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export async function fetchCalendars(token: string): Promise<CalendarInfo[]> {
  const data = await calendarFetch<{ calendars: CalendarInfo[] }>("/v1/calendar/calendars", {
    token,
  });
  return data.calendars;
}

export async function fetchCalendarEvents(
  token: string,
  calendarIds: string[],
  start: string,
  end: string,
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    calendarId: calendarIds.join(","),
    start,
    end,
  });
  const data = await calendarFetch<{ events: CalendarEvent[] }>(
    `/v1/calendar/events?${params.toString()}`,
    { token },
  );
  return data.events;
}

export async function fetchCalendarEvent(
  token: string,
  calendarId: string,
  eventUid: string,
): Promise<CalendarEvent> {
  const params = new URLSearchParams({ calendarId });
  const data = await calendarFetch<{ event: CalendarEvent }>(
    `/v1/calendar/events/${encodeURIComponent(eventUid)}?${params.toString()}`,
    { token },
  );
  return data.event;
}

export async function createCalendarEvent(
  token: string,
  input: CalendarEventInput,
): Promise<CalendarEvent> {
  const data = await calendarFetch<{ event: CalendarEvent }>("/v1/calendar/events", {
    method: "POST",
    token,
    body: JSON.stringify(input),
  });
  return data.event;
}

export async function updateCalendarEvent(
  token: string,
  eventUid: string,
  input: CalendarEventInput,
): Promise<CalendarEvent> {
  const data = await calendarFetch<{ event: CalendarEvent }>(
    `/v1/calendar/events/${encodeURIComponent(eventUid)}`,
    {
      method: "PUT",
      token,
      body: JSON.stringify(input),
    },
  );
  return data.event;
}

export async function deleteCalendarEvent(
  token: string,
  calendarId: string,
  eventUid: string,
): Promise<void> {
  const params = new URLSearchParams({ calendarId });
  await calendarFetch<void>(
    `/v1/calendar/events/${encodeURIComponent(eventUid)}?${params.toString()}`,
    {
      method: "DELETE",
      token,
    },
  );
}
