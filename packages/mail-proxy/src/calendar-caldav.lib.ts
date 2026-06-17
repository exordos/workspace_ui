/**
 * CalDAV client for Mailcow SOGo calendar integration.
 */

import { randomUUID } from "node:crypto";
import { caldavHttpsFetch } from "./calendar-caldav-fetch.lib";
import type { RequestInit as UndiciRequestInit } from "undici";
import {
  buildCalendarHomeUrl,
  buildCalendarHomeUrlCandidates,
  decodeCalendarDataXml,
  eventIntersectsRange,
  extractXmlTag,
  sogoDavUserSegment,
  toCalDavTimeRangeValue,
} from "./calendar-caldav-url.lib";
import {
  expandRecurringEvents,
  mergeEventInputWithExisting,
  parseVeventFromIcs,
  buildIcsFromInput,
} from "./calendar-ical.lib";
import { mailProxyEnv } from "./mail-env.lib";
import type { MailSessionRecord } from "./mail-session.lib";
import type { CalendarEvent, CalendarEventInput, CalendarInfo } from "./calendar.types";

function basicAuthHeader(email: string, password: string): string {
  return `Basic ${Buffer.from(`${email}:${password}`).toString("base64")}`;
}

const resolvedCalendarHomeByToken = new Map<string, string>();

const CALENDAR_HOME_PROBE_BODY = `<?xml version="1.0"?><D:propfind xmlns:D="DAV:"><D:prop><D:displayname/></D:prop></D:propfind>`;

/** Test helper — clears resolved CalDAV home URL cache. */
export function clearCalendarHomeCacheForTests(): void {
  resolvedCalendarHomeByToken.clear();
}

async function resolveCalendarHomeUrl(session: MailSessionRecord): Promise<string> {
  const cached = resolvedCalendarHomeByToken.get(session.token);
  if (cached != null) return cached;

  const candidates = buildCalendarHomeUrlCandidates(
    mailProxyEnv.SOGO_URL,
    mailProxyEnv.CALDAV_PREFIX,
    session.email,
  );

  for (const homeUrl of candidates) {
    const response = await caldavFetch(session, homeUrl, {
      method: "PROPFIND",
      headers: { Depth: "0", "Content-Type": "application/xml; charset=utf-8" },
      body: CALENDAR_HOME_PROBE_BODY,
    });
    if (response.ok) {
      resolvedCalendarHomeByToken.set(session.token, homeUrl);
      return homeUrl;
    }
    if (response.status !== 401) {
      throw formatCaldavHttpError(response.status, homeUrl);
    }
  }

  throw formatCaldavHttpError(401, candidates[0] ?? mailProxyEnv.SOGO_URL);
}

function calendarHomeUrl(session: MailSessionRecord): string {
  return (
    resolvedCalendarHomeByToken.get(session.token) ??
    buildCalendarHomeUrl(mailProxyEnv.SOGO_URL, mailProxyEnv.CALDAV_PREFIX, session.email)
  );
}

function calendarCollectionUrl(session: MailSessionRecord, calendarId: string): string {
  const home = calendarHomeUrl(session);
  const id = calendarId.replace(/\/+$/, "");
  return `${home}${id}/`;
}

function eventResourceUrl(session: MailSessionRecord, calendarId: string, eventUid: string): string {
  const collection = calendarCollectionUrl(session, calendarId);
  return `${collection}${encodeURIComponent(eventUid)}.ics`;
}

async function caldavFetch(
  session: MailSessionRecord,
  url: string,
  init: Omit<UndiciRequestInit, "headers"> & { headers?: Record<string, string> } = {},
): Promise<Response> {
  const { headers: extraHeaders, ...rest } = init;
  const headers: Record<string, string> = {
    ...extraHeaders,
    Authorization: basicAuthHeader(session.email, session.password),
  };
  try {
    return await caldavHttpsFetch(url, { ...rest, headers });
  } catch (error) {
    throw formatCaldavFetchError(url, error);
  }
}

function formatCaldavHttpError(status: number, url: string): Error {
  if (status === 401) {
    return new Error(
      "CalDAV authentication failed (401). In Mailcow → mailbox → Protocol access, enable " +
        "\"DAV\" (CalDAV/CardDAV) for this user — IMAP and SOGo web can work while DAV is disabled. " +
        "If 2FA is enabled, use an app-specific password instead of the mailbox password.",
    );
  }
  return new Error(`CalDAV request failed (${status}) for ${url}`);
}

function formatCaldavFetchError(url: string, error: unknown): Error {
  const cause = error instanceof Error ? error.cause : undefined;
  const causeCode =
    cause != null && typeof cause === "object" && "code" in cause
      ? String((cause as { code?: string }).code ?? "")
      : "";
  const hint =
    mailProxyEnv.SOGO_URL.includes("127.0.0.1") || mailProxyEnv.SOGO_URL.includes("localhost")
      ? " Set MAILCOW_SOGO_URL=https://mail.example.test (or your MAILCOW_HOSTNAME) — SOGo is not on bare 127.0.0.1."
      : " Ensure Mailcow is running, /etc/hosts maps the hostname to 127.0.0.1, and MAILCOW_TLS_REJECT_UNAUTHORIZED=false for dev certs.";
  const detail =
    causeCode.length > 0
      ? causeCode
      : error instanceof Error
        ? error.message
        : "fetch failed";
  return new Error(`CalDAV unreachable (${url}): ${detail}.${hint}`);
}

function extractHref(block: string): string | null {
  const match = /<(?:[a-zA-Z0-9]+:)?href[^>]*>([^<]+)<\/(?:[a-zA-Z0-9]+:)?href>/i.exec(block);
  return match?.[1]?.trim() ?? null;
}

function parseCalendarIdFromHref(homeUrl: string, href: string): string | null {
  try {
    const home = new URL(homeUrl);
    const resolved = new URL(href, home);
    if (!resolved.pathname.startsWith(home.pathname)) return null;
    const suffix = resolved.pathname.slice(home.pathname.length);
    const trimmed = suffix.replace(/^\/+|\/+$/g, "");
    if (trimmed.length === 0) return null;
    return decodeURIComponent(trimmed.split("/")[0] ?? "");
  } catch {
    return null;
  }
}

function isCalendarCollection(block: string): boolean {
  const resourceType = extractXmlTag(block, "resourcetype") ?? "";
  if (resourceType.includes("calendar")) return true;
  // SOGo sometimes omits caldav:calendar in PROPFIND — accept collection hrefs under Calendar/
  return resourceType.includes("collection");
}

export async function listCalendars(session: MailSessionRecord): Promise<CalendarInfo[]> {
  const homeUrl = await resolveCalendarHomeUrl(session);
  const body = `<?xml version="1.0" encoding="utf-8" ?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:CS="http://calendarserver.org/ns/" xmlns:ICAL="http://apple.com/ns/ical/">
  <D:prop>
    <D:displayname/>
    <D:resourcetype/>
    <CS:getctag/>
    <ICAL:calendar-color/>
  </D:prop>
</D:propfind>`;

  const response = await caldavFetch(session, homeUrl, {
    method: "PROPFIND",
    headers: {
      Depth: "1",
      "Content-Type": "application/xml; charset=utf-8",
    },
    body,
  });

  if (!response.ok) {
    throw formatCaldavHttpError(response.status, homeUrl);
  }

  const xml = await response.text();
  const responses = xml.split(/<(?:[a-zA-Z0-9]+:)?response[\s>]/i).slice(1);
  const calendars: CalendarInfo[] = [];
  const seenIds = new Set<string>();

  for (const block of responses) {
    const href = extractHref(block);
    if (href == null) continue;
    const calendarId = parseCalendarIdFromHref(homeUrl, href);
    if (calendarId == null || seenIds.has(calendarId)) continue;
    if (!isCalendarCollection(block)) continue;

    seenIds.add(calendarId);
    calendars.push({
      id: calendarId,
      displayName: extractXmlTag(block, "displayname") ?? calendarId,
      color: extractXmlTag(block, "calendar-color") ?? null,
      ctag: extractXmlTag(block, "getctag") ?? null,
    });
  }

  return calendars;
}

export async function queryCalendarEvents(
  session: MailSessionRecord,
  calendarIds: string[],
  startIso: string,
  endIso: string,
): Promise<CalendarEvent[]> {
  const rangeStart = new Date(startIso);
  const rangeEnd = new Date(endIso);
  const allEvents: CalendarEvent[] = [];

  const rangeStartCal = toCalDavTimeRangeValue(startIso);
  const rangeEndCal = toCalDavTimeRangeValue(endIso);

  for (const calendarId of calendarIds) {
    const collectionUrl = calendarCollectionUrl(session, calendarId);
    const reportBody = `<?xml version="1.0" encoding="utf-8" ?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:getetag/>
    <C:calendar-data/>
  </D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        <C:time-range start="${rangeStartCal}" end="${rangeEndCal}"/>
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`;

    const response = await caldavFetch(session, collectionUrl, {
      method: "REPORT",
      headers: {
        Depth: "1",
        "Content-Type": "application/xml; charset=utf-8",
      },
      body: reportBody,
    });

    if (!response.ok) {
      throw new Error(`CalDAV REPORT failed for ${calendarId} (${response.status})`);
    }

    const xml = await response.text();
    const blocks = xml.split(/<(?:[a-zA-Z0-9]+:)?response[\s>]/i).slice(1);

    for (const block of blocks) {
      const calendarData = extractXmlTag(block, "calendar-data");
      if (calendarData == null || calendarData.length === 0) continue;
      const etag = extractXmlTag(block, "getetag")?.replace(/^"|"$/g, "") ?? null;
      const decoded = decodeCalendarDataXml(calendarData);
      const events = parseVeventFromIcs(decoded, calendarId, etag);
      allEvents.push(...events);
    }
  }

  return expandRecurringEvents(allEvents, rangeStart, rangeEnd);
}

export async function getCalendarEvent(
  session: MailSessionRecord,
  calendarId: string,
  eventUid: string,
): Promise<CalendarEvent | null> {
  const url = eventResourceUrl(session, calendarId, eventUid);
  const response = await caldavFetch(session, url, { method: "GET" });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`CalDAV GET failed (${response.status})`);
  }
  const ics = await response.text();
  const etag = response.headers.get("etag");
  const events = parseVeventFromIcs(ics, calendarId, etag);
  return events[0] ?? null;
}

export async function createCalendarEvent(
  session: MailSessionRecord,
  input: CalendarEventInput,
): Promise<CalendarEvent> {
  const uid = input.uid ?? randomUUID();
  const ics = buildIcsFromInput(input, uid);
  const url = eventResourceUrl(session, input.calendarId, uid);
  const response = await caldavFetch(session, url, {
    method: "PUT",
    headers: { "Content-Type": "text/calendar; charset=utf-8" },
    body: ics,
  });
  if (!response.ok) {
    throw new Error(`CalDAV PUT create failed (${response.status})`);
  }
  const event = await getCalendarEvent(session, input.calendarId, uid);
  if (event == null) {
    throw new Error("Event created but could not be fetched");
  }
  return event;
}

export async function updateCalendarEvent(
  session: MailSessionRecord,
  eventUid: string,
  input: CalendarEventInput,
): Promise<CalendarEvent> {
  const url = eventResourceUrl(session, input.calendarId, eventUid);
  let existingIcs = "";
  const getResponse = await caldavFetch(session, url, { method: "GET" });
  if (getResponse.ok) {
    existingIcs = await getResponse.text();
  }
  const ics =
    existingIcs.length > 0
      ? mergeEventInputWithExisting(existingIcs, input, eventUid)
      : buildIcsFromInput(input, eventUid);

  const headers: Record<string, string> = { "Content-Type": "text/calendar; charset=utf-8" };
  if (input.etag != null && input.etag.length > 0) {
    headers["If-Match"] = input.etag;
  }

  const response = await caldavFetch(session, url, {
    method: "PUT",
    headers,
    body: ics,
  });
  if (!response.ok) {
    throw new Error(`CalDAV PUT update failed (${response.status})`);
  }
  const event = await getCalendarEvent(session, input.calendarId, eventUid);
  if (event == null) {
    throw new Error("Event updated but could not be fetched");
  }
  return event;
}

export async function deleteCalendarEvent(
  session: MailSessionRecord,
  calendarId: string,
  eventUid: string,
): Promise<void> {
  const url = eventResourceUrl(session, calendarId, eventUid);
  const response = await caldavFetch(session, url, { method: "DELETE" });
  if (response.status === 404) return;
  if (!response.ok) {
    throw new Error(`CalDAV DELETE failed (${response.status})`);
  }
}

export async function verifyCaldavCredentials(session: MailSessionRecord): Promise<void> {
  await resolveCalendarHomeUrl(session);
}

// Re-export for tests
export { sogoDavUserSegment };
