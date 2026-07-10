/**
 * Minimal CalDAV transport request parsing (security boundary only).
 */

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
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} query parameter is required`);
  }
  const trimmed = value.trim();
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a valid ISO date`);
  }
  return new Date(parsed).toISOString();
}

export function parseEventUidParam(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("eventUid is required");
  }
  return value.trim();
}

export function parseCalendarIcsBody(body: unknown): {
  calendarId: string;
  ics: string;
  etag?: string;
} {
  if (body == null || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const record = body as Record<string, unknown>;
  const calendarId = typeof record.calendarId === "string" ? record.calendarId.trim() : "";
  const ics = typeof record.ics === "string" ? record.ics : "";
  if (calendarId.length === 0 || ics.length === 0) {
    throw new Error("calendarId and ics are required");
  }
  const etag = typeof record.etag === "string" ? record.etag : undefined;
  return { calendarId, ics, etag };
}
