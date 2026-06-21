/**
 * Workspace gateway per-user message API (`GET /api/messanger/v1/me/messages/`).
 *
 * Returns the authenticated user's synced message-view rows (markdown content plus personal
 * read/pinned/starred flags) for their streams. The request is authenticated with the instance
 * IAM bearer token, attached automatically by the shared client auth middleware (same path as
 * {@link import("./messenger-streams").fetchMyStreams `fetchMyStreams`}).
 *
 * Pagination is marker-based: send `page_limit` and, for subsequent pages, `page_marker` set to
 * the previous page's last row uuid. The server echoes the next marker in the
 * `X-Pagination-Marker` response header and omits it on the final page. Filtering by stream is a
 * plain `user_stream_uuid=<uuid>` equality query param; `project_id`/`user_uuid` are scoped
 * server-side from the token and must not be sent.
 */
import { createLogger } from "~/shared/lib/logger";
import type { MessageId } from "~/shared/lib/message-id.lib";
import { getMessengerGatewayApiBaseForCurrentInstance, messengerApi } from "./client";
import type {
  MessagesPageResult,
  MessengerMeMessage,
  MessengerMeMessagePayload,
  MessengerMeMessagesPage,
  MockMessage,
} from "./messenger.types";

const log = createLogger("messenger-me-messages");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Default rows per `/me/messages/` request. */
export const ME_MESSAGES_PAGE_LIMIT = 100;

/** Safety bound on marker-following so a misbehaving cursor cannot loop forever. */
const ME_MESSAGES_MAX_PAGES = 100;

const ME_MESSAGES_PATH = "/me/messages/";

export type MeMessagesSortKey = "created_at" | "updated_at" | "last_synced_at" | "uuid";
export type MeMessagesSortDir = "asc" | "desc";

export interface FetchMyMessagesOptions {
  /** Restrict to a single stream (`user_stream_uuid` equality filter). */
  streamUuid?: string;
  /** Page size (`page_limit`); defaults to {@link ME_MESSAGES_PAGE_LIMIT}. */
  limit?: number;
  /** Pagination cursor (`page_marker`): the previous page's last row uuid. */
  marker?: string | null;
  /** Server sort column; defaults to `created_at`. */
  sortKey?: MeMessagesSortKey;
  /** Server sort direction; defaults to `asc` (oldest first, natural chat order). */
  sortDir?: MeMessagesSortDir;
  signal?: AbortSignal;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function readUuid(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim().toLowerCase();
  return UUID_RE.test(trimmed) ? trimmed : undefined;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function normalizeStreamUuid(value: string, context: string): string {
  const normalized = readUuid(value);
  if (normalized == null) {
    throw new Error(`Invalid stream uuid in ${context}: ${JSON.stringify(value)}`);
  }
  return normalized;
}

function parseMeMessagePayload(value: unknown): MessengerMeMessagePayload | null {
  if (!isRecord(value)) {
    return null;
  }
  const content = readOptionalString(value.content);
  if (content == null) {
    return null;
  }
  // `kind` is always "markdown" for this API; tolerate omission rather than dropping the row.
  return { kind: "markdown", content };
}

/** Maps one raw `/me/messages/` row to {@link MessengerMeMessage}; returns null when unusable. */
export function parseMeMessage(row: unknown): MessengerMeMessage | null {
  if (!isRecord(row)) {
    return null;
  }
  const uuid = readUuid(row.uuid);
  const userStreamUuid = readUuid(row.user_stream_uuid);
  const payload = parseMeMessagePayload(row.payload);
  if (uuid == null || userStreamUuid == null || payload == null) {
    return null;
  }
  const userUuid = readUuid(row.user_uuid);
  const projectId = readUuid(row.project_id);
  const lastSyncedAt = readOptionalString(row.last_synced_at);
  const createdAt = readOptionalString(row.created_at);
  const updatedAt = readOptionalString(row.updated_at);
  return {
    uuid,
    user_stream_uuid: userStreamUuid,
    payload,
    read: row.read === true,
    pinned: row.pinned === true,
    starred: row.starred === true,
    ...(userUuid != null ? { user_uuid: userUuid } : {}),
    ...(projectId != null ? { project_id: projectId } : {}),
    ...(lastSyncedAt != null ? { last_synced_at: lastSyncedAt } : {}),
    ...(createdAt != null ? { created_at: createdAt } : {}),
    ...(updatedAt != null ? { updated_at: updatedAt } : {}),
  };
}

function extractMeMessageItems(data: unknown): unknown[] {
  if (Array.isArray(data)) {
    return data;
  }
  if (!isRecord(data)) {
    return [];
  }
  if (Array.isArray(data.messages)) {
    return data.messages;
  }
  if (Array.isArray(data.results)) {
    return data.results;
  }
  return [];
}

/** Reads the next marker from `X-Pagination-Marker` (defensive against header-less mocks). */
function readNextMarker(headers: unknown): string | null {
  if (headers == null || typeof (headers as Headers).get !== "function") {
    return null;
  }
  const marker = (headers as Headers).get("X-Pagination-Marker");
  const trimmed = marker?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function buildMeMessagesParams(options: FetchMyMessagesOptions): Record<string, string> {
  const params: Record<string, string> = {
    page_limit: String(options.limit ?? ME_MESSAGES_PAGE_LIMIT),
    sort_key: options.sortKey ?? "created_at",
    sort_dir: options.sortDir ?? "asc",
  };
  if (options.streamUuid != null) {
    params.user_stream_uuid = normalizeStreamUuid(options.streamUuid, "fetchMyMessages.streamUuid");
  }
  const marker = options.marker?.trim();
  if (marker != null && marker.length > 0) {
    params.page_marker = marker;
  }
  return params;
}

/**
 * Fetches a single page of the user's message inbox from the gateway. Returns the parsed rows and
 * the next pagination marker (`null` on the final page). Resolves to an empty page on non-ok
 * responses; rethrows abort errors.
 */
export async function fetchMyMessagesPage(
  options: FetchMyMessagesOptions = {},
): Promise<MessengerMeMessagesPage> {
  if (options.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  const res = await messengerApi.getWithBase(
    getMessengerGatewayApiBaseForCurrentInstance(),
    ME_MESSAGES_PATH,
    buildMeMessagesParams(options),
    options.signal,
  );
  if (!res.ok) {
    log.warn("me/messages page request failed", { status: res.status });
    return { messages: [], nextMarker: null };
  }
  const messages = extractMeMessageItems(res.data)
    .map((row) => parseMeMessage(row))
    .filter((row): row is MessengerMeMessage => row != null);
  return { messages, nextMarker: readNextMarker(res.headers) };
}

/**
 * Drains every page of the user's message inbox by following the pagination marker. Pass
 * `streamUuid` to restrict to one stream. Stops at {@link ME_MESSAGES_MAX_PAGES} pages (logging a
 * warning) so a stalled cursor cannot loop forever.
 */
export async function fetchMyMessages(
  options: FetchMyMessagesOptions = {},
): Promise<MessengerMeMessage[]> {
  const collected: MessengerMeMessage[] = [];
  const seenMarkers = new Set<string>();
  let marker = options.marker ?? null;

  for (let page = 0; page < ME_MESSAGES_MAX_PAGES; page += 1) {
    const result = await fetchMyMessagesPage({ ...options, marker });
    collected.push(...result.messages);
    const next = result.nextMarker;
    if (next == null || result.messages.length === 0 || seenMarkers.has(next)) {
      return collected;
    }
    seenMarkers.add(next);
    marker = next;
  }

  log.warn("me/messages pagination hit max pages; results may be truncated", {
    maxPages: ME_MESSAGES_MAX_PAGES,
    collected: collected.length,
    ...(options.streamUuid != null ? { streamUuid: options.streamUuid } : {}),
  });
  return collected;
}

/**
 * Fetches all of a stream's messages for the current user (oldest first), following pagination.
 * `streamUuid` is the stream's `stream_uuid` (a.k.a. `user_stream_uuid` on message rows).
 */
export async function fetchStreamMessages(
  streamUuid: string,
  options: Omit<FetchMyMessagesOptions, "streamUuid"> = {},
): Promise<MessengerMeMessage[]> {
  const normalized = normalizeStreamUuid(streamUuid, "fetchStreamMessages.streamUuid");
  return fetchMyMessages({ ...options, streamUuid: normalized });
}

/** Epoch seconds from an ISO timestamp; 0 when absent or unparseable. */
function isoToEpochSeconds(value: string | undefined): number {
  if (value == null) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : Math.floor(parsed / 1000);
}

/**
 * Bridges a gateway message-view row to the UI {@link MockMessage} shape so stream messages can be
 * rendered by the existing message list. The `/me/messages/` endpoint carries no sender identity,
 * so `sender_id` is `0` and `sender_full_name` is empty; resolve those from stream/membership data
 * at the call site when needed. The body is markdown, mirrored into `markdown_source` for editing.
 * Pass `streamId` to stamp the numeric channel id used by sidebar/route association (null for DMs).
 */
export function meMessageToMockMessage(
  message: MessengerMeMessage,
  streamId: number | null = null,
): MockMessage {
  const content = message.payload.content;
  const flags: string[] = [];
  if (message.read) flags.push("read");
  if (message.starred) flags.push("starred");
  const id: MessageId = message.uuid;
  const base: MockMessage = {
    id,
    sender_id: 0,
    sender_full_name: "",
    stream_id: streamId,
    subject: "",
    content,
    timestamp: isoToEpochSeconds(message.created_at),
    flags,
  };
  if (content.trim().length > 0) {
    base.markdown_source = content;
  }
  return base;
}

/** Fetches a single message-view row by uuid (`GET /me/messages/<uuid>`); null on miss/non-ok. */
export async function fetchMeMessageById(
  uuid: string,
  signal?: AbortSignal,
): Promise<MessengerMeMessage | null> {
  const id = readUuid(uuid);
  if (id == null) {
    return null;
  }
  const res = await messengerApi.getWithBase(
    getMessengerGatewayApiBaseForCurrentInstance(),
    `${ME_MESSAGES_PATH}${id}`,
    undefined,
    signal,
  );
  if (!res.ok) {
    return null;
  }
  return parseMeMessage(res.data);
}

export interface FetchStreamMessagesPageArgs {
  streamUuid: string;
  /** Stamped onto each {@link MockMessage}; pass the numeric channel id or null for DMs. */
  streamId?: number | null;
  /** A message uuid pages relative to it; the `"newest"` sentinel loads the latest window. */
  anchor?: MessageId;
  /** Older rows to load (relative to anchor, or window size when anchor is `"newest"`). */
  numBefore?: number;
  /** Newer rows to load relative to anchor (ignored when anchor is `"newest"`). */
  numAfter?: number;
  signal?: AbortSignal;
}

/**
 * Marker-paginated page fetch for one chat (channel or DM) keyed by `stream_uuid`, returning the
 * UI {@link MessagesPageResult} shape so it is a drop-in replacement for the legacy narrow page
 * fetch. Modes by argument:
 * - `anchor: "newest"` → latest `numBefore` rows (initial load); `foundNewest` is always true.
 * - `numBefore > 0` only → older rows before `anchor` (load-older).
 * - `numAfter > 0` only → newer rows after `anchor` (load-newer).
 * - both `> 0` → a window around `anchor` (focused-message load), including the anchor row.
 *
 * The backend marker is strict (`>`/`<`), so the anchor row is excluded from older/newer pages;
 * `foundOldest`/`foundNewest` reflect the absence of a further pagination marker.
 */
export async function fetchStreamMessagesPage(
  args: FetchStreamMessagesPageArgs,
): Promise<MessagesPageResult> {
  const streamUuid = normalizeStreamUuid(args.streamUuid, "fetchStreamMessagesPage.streamUuid");
  const streamId = args.streamId ?? null;
  const anchor = args.anchor ?? "newest";
  const numBefore = Math.max(0, Math.floor(args.numBefore ?? 0));
  const numAfter = Math.max(0, Math.floor(args.numAfter ?? 0));
  const toMock = (rows: MessengerMeMessage[]): MockMessage[] =>
    rows.map((row) => meMessageToMockMessage(row, streamId));

  if (anchor === "newest") {
    const page = await fetchMyMessagesPage({
      streamUuid,
      limit: numBefore > 0 ? numBefore : ME_MESSAGES_PAGE_LIMIT,
      sortKey: "created_at",
      sortDir: "desc",
      signal: args.signal,
    });
    return {
      messages: toMock([...page.messages].reverse()),
      foundOldest: page.nextMarker == null,
      foundNewest: true,
    };
  }

  if (numBefore > 0 && numAfter > 0) {
    const [olderPage, center, newerPage] = await Promise.all([
      fetchMyMessagesPage({
        streamUuid,
        limit: numBefore,
        sortKey: "created_at",
        sortDir: "desc",
        marker: anchor,
        signal: args.signal,
      }),
      fetchMeMessageById(anchor, args.signal),
      fetchMyMessagesPage({
        streamUuid,
        limit: numAfter,
        sortKey: "created_at",
        sortDir: "asc",
        marker: anchor,
        signal: args.signal,
      }),
    ]);
    const ascending = [
      ...[...olderPage.messages].reverse(),
      ...(center != null ? [center] : []),
      ...newerPage.messages,
    ];
    return {
      messages: toMock(ascending),
      foundOldest: olderPage.nextMarker == null,
      foundNewest: newerPage.nextMarker == null,
    };
  }

  if (numAfter > 0) {
    const page = await fetchMyMessagesPage({
      streamUuid,
      limit: numAfter,
      sortKey: "created_at",
      sortDir: "asc",
      marker: anchor,
      signal: args.signal,
    });
    return {
      messages: toMock(page.messages),
      foundOldest: false,
      foundNewest: page.nextMarker == null,
    };
  }

  const page = await fetchMyMessagesPage({
    streamUuid,
    limit: numBefore > 0 ? numBefore : ME_MESSAGES_PAGE_LIMIT,
    sortKey: "created_at",
    sortDir: "desc",
    marker: anchor,
    signal: args.signal,
  });
  return {
    messages: toMock([...page.messages].reverse()),
    foundOldest: page.nextMarker == null,
    foundNewest: false,
  };
}
