/**
 * SOGo / CalDAV URL and XML helpers for Mailcow calendar integration.
 */

/** SOGo CalDAV user path segment — @ must be percent-encoded in the URL path. */
export function sogoDavUserPathSegment(email: string): string {
  return encodeURIComponent(email.trim());
}

/** @deprecated Use sogoDavUserPathSegment — kept for tests/docs clarity. */
export function sogoDavUserSegment(email: string): string {
  return sogoDavUserPathSegment(email);
}

export function buildDavRootUrl(sogoUrl: string, caldavPrefix: string): string {
  const base = sogoUrl.replace(/\/+$/, "");
  const prefix = caldavPrefix.replace(/\/+$/, "");
  return `${base}${prefix}/`;
}

export function buildCalendarHomeUrl(
  sogoUrl: string,
  caldavPrefix: string,
  email: string,
): string {
  const base = sogoUrl.replace(/\/+$/, "");
  const prefix = caldavPrefix.replace(/\/+$/, "");
  return `${base}${prefix}/${sogoDavUserPathSegment(email)}/Calendar/`;
}

/** Encoded (%40) and literal (@) SOGo paths — older SOGo builds differ. */
export function buildCalendarHomeUrlCandidates(
  sogoUrl: string,
  caldavPrefix: string,
  email: string,
): string[] {
  const base = sogoUrl.replace(/\/+$/, "");
  const prefix = caldavPrefix.replace(/\/+$/, "");
  const trimmed = email.trim();
  const encoded = `${base}${prefix}/${encodeURIComponent(trimmed)}/Calendar/`;
  const literal = `${base}${prefix}/${trimmed}/Calendar/`;
  return encoded === literal ? [encoded] : [encoded, literal];
}

function codePointToChar(codePoint: number): string {
  if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return "";
  }
  return String.fromCodePoint(codePoint);
}

/** Decode XML character and named entities (SOGo CalDAV encodes non-ASCII as &#NNN;). */
export function decodeXmlTextEntities(raw: string): string {
  return raw
    .replace(/&#x([0-9a-fA-F]+);/gi, (_, hex: string) => codePointToChar(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => codePointToChar(parseInt(dec, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Decode calendar-data from CalDAV multistatus (CDATA + entities). */
export function decodeCalendarDataXml(raw: string): string {
  return decodeXmlTextEntities(raw).replace(/&#x0D;/gi, "").trim();
}

export function extractXmlTag(block: string, tag: string): string | null {
  const regex = new RegExp(`<(?:[a-zA-Z0-9]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9]+:)?${tag}>`, "i");
  const match = regex.exec(block);
  if (match?.[1] == null) return null;
  return decodeXmlTextEntities(match[1].trim());
}

/** CalDAV time-range value from a calendar date (YYYY-MM-DD) or ISO string. */
export function toCalDavTimeRangeValue(iso: string): string {
  const datePart = iso.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    return `${datePart.replace(/-/g, "")}T000000Z`;
  }
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${mo}${da}T000000Z`;
}

/** Add one day to YYYY-MM-DD (for exclusive all-day DTEND normalization). */
export function addOneDayIsoDate(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  const next = new Date(Date.UTC(y!, m! - 1, d! + 1));
  const ny = next.getUTCFullYear();
  const nm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const nd = String(next.getUTCDate()).padStart(2, "0");
  return `${ny}-${nm}-${nd}`;
}

export function normalizeAllDayEndIso(startIso: string, endIso: string): string {
  const startDate = startIso.slice(0, 10);
  const endDate = endIso.slice(0, 10);
  if (endDate <= startDate) {
    return addOneDayIsoDate(startDate);
  }
  return endDate;
}

export function eventIntersectsRange(
  event: { start: string; end: string; allDay: boolean },
  rangeStart: Date,
  rangeEnd: Date,
): boolean {
  const eventStart = event.allDay
    ? new Date(`${event.start.slice(0, 10)}T00:00:00Z`)
    : new Date(event.start);
  let eventEndExclusive = event.allDay
    ? new Date(`${normalizeAllDayEndIso(event.start, event.end).slice(0, 10)}T00:00:00Z`)
    : new Date(event.end);
  if (event.allDay && eventEndExclusive.getTime() <= eventStart.getTime()) {
    eventEndExclusive = new Date(eventStart.getTime() + 24 * 60 * 60 * 1000);
  }
  return eventStart < rangeEnd && eventEndExclusive > rangeStart;
}
