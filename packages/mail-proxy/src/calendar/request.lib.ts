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
  recurrenceId?: string;
  scope?: "this" | "thisAndFuture" | "all";
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
  const recurrenceId = typeof record.recurrenceId === "string" ? record.recurrenceId : undefined;
  const scopeRaw = record.scope;
  const scope =
    scopeRaw === "this" || scopeRaw === "thisAndFuture" || scopeRaw === "all"
      ? scopeRaw
      : undefined;
  return { calendarId, ics, etag, recurrenceId, scope };
}

export function parseOptionalRecurrenceIdQuery(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) return undefined;
  return value.trim();
}

export function parseOptionalScopeQuery(
  value: unknown,
): "this" | "thisAndFuture" | "all" | undefined {
  if (value === "this" || value === "thisAndFuture" || value === "all") return value;
  return undefined;
}

export function parseCreateCalendarBody(body: unknown): {
  displayName: string;
  color?: string;
} {
  if (body == null || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const record = body as Record<string, unknown>;
  const displayName = typeof record.displayName === "string" ? record.displayName.trim() : "";
  if (displayName.length === 0) {
    throw new Error("displayName is required");
  }
  const color = typeof record.color === "string" ? record.color : undefined;
  return { displayName, color };
}

export function parseUpdateCalendarBody(body: unknown): {
  displayName?: string;
  color?: string | null;
} {
  if (body == null || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const record = body as Record<string, unknown>;
  const displayName =
    typeof record.displayName === "string" ? record.displayName.trim() : undefined;
  const color =
    record.color === null
      ? null
      : typeof record.color === "string"
        ? record.color
        : undefined;
  return { displayName, color };
}

export function parseMoveCalendarEventBody(body: unknown): {
  fromCalendarId: string;
  toCalendarId: string;
  recurrenceId?: string;
} {
  if (body == null || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const record = body as Record<string, unknown>;
  const fromCalendarId =
    typeof record.fromCalendarId === "string" ? record.fromCalendarId.trim() : "";
  const toCalendarId = typeof record.toCalendarId === "string" ? record.toCalendarId.trim() : "";
  if (fromCalendarId.length === 0 || toCalendarId.length === 0) {
    throw new Error("fromCalendarId and toCalendarId are required");
  }
  const recurrenceId =
    typeof record.recurrenceId === "string" ? record.recurrenceId.trim() : undefined;
  return { fromCalendarId, toCalendarId, recurrenceId };
}

export function parseSearchQuery(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("q query parameter is required");
  }
  return value.trim();
}

export function parseEmailsQuery(value: unknown): string[] {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("emails query parameter is required");
  }
  return value
    .split(",")
    .map((email) => email.trim())
    .filter((email) => email.length > 0);
}
