/**
 * Zulip messages API: load, send, edit, reactions, flags, snippets, and activity narrows.
 */
import { t } from "~/i18n/i18n";
import { guard } from "~/shared/lib/guards";
import { createLogger } from "~/shared/lib/logger";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import {
  ZULIP_DM_CHAT_NUM_AFTER,
  ZULIP_DM_ANCHOR_NUM_BEFORE,
  ZULIP_STREAM_ANCHOR_NUM_BEFORE,
  ZULIP_STREAM_CHAT_NUM_AFTER,
} from "~/shared/lib/zulip-message-window.lib";
import {
  normalizeZulipMessagesNarrowForApi,
  zulipTopicNarrowOperandForApi,
} from "~/shared/lib/zulip-topic-narrow.lib";
import { getClient, buildMessagesQueryParams } from "./zulip-client.internal";
import { mockMessageFromGetMessageApiData, rawMessageToMockMessage } from "./zulip-message-map.lib";
import { postZulipSendMessage } from "./zulip-message-send.internal";
import { mapMessagesPageFromApiData } from "./zulip-messages-page.lib";
import {
  zulipPipelineDelete,
  zulipPipelineGet,
  zulipPipelinePatch,
  zulipPipelinePost,
} from "./zulip-pipeline.internal";
import {
  validateMessageIds,
  validateMessagesApiAnchor,
  validateNonNegativeInteger,
} from "./zulip-validation.internal";
import type {
  ActivityFilter,
  ActivityMessagesPageResult,
  CreateSavedSnippetParams,
  ReactionType,
  MockMessage,
  MessagesPageResult,
  RawMessageToMockInput,
  SavedSnippet,
  SendMessageParams,
  ZulipRawMessage,
} from "./zulip.types";

interface MessageWindowOptions {
  anchor: string | number;
  numBefore: number;
  numAfter: number;
  includeAnchor?: boolean;
  applyMarkdown?: boolean;
}

interface NarrowEntry {
  negated?: boolean;
  operator: string;
  operand: string | number;
}

const log = createLogger("api:zulip-messages");

/** Zulip allows up to 5000 messages per GET /messages request. */
const MESSAGE_IDS_CHUNK_SIZE = 1000;
const MESSAGE_IDS_FALLBACK_CONCURRENCY = 8;

let loggedMessageIdsBatchFallback = false;

function parseMessagesListResponse(data: unknown): ZulipRawMessage[] | null {
  if (data == null || typeof data !== "object") return null;
  const payload = data as { result?: string; messages?: ZulipRawMessage[] };
  if (payload.result === "error") return null;
  return payload.messages ?? [];
}

function zulipRawMessageFromGetMessageApiData(data: unknown): ZulipRawMessage | null {
  if (data == null || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  if (row.result === "error") return null;
  if (row.message != null && typeof row.message === "object") {
    const message = row.message as ZulipRawMessage;
    return Number.isInteger(message.id) && message.id > 0 ? message : null;
  }
  if (typeof row.id === "number" && row.id > 0) {
    return row as unknown as ZulipRawMessage;
  }
  return null;
}

async function fetchMessagesByIdsChunk(messageIds: number[]): Promise<{
  messages: ZulipRawMessage[];
  apiError: boolean;
}> {
  if (messageIds.length === 0) {
    return { messages: [], apiError: false };
  }
  const messageIdsParam = JSON.stringify(messageIds);
  log.info("fetchMessagesByIds: GET /messages (message_ids batch)", {
    chunkSize: messageIds.length,
    messageIdsParamLength: messageIdsParam.length,
    messageIdSample: messageIds.slice(0, 8),
  });
  const res = await zulipPipelineGet("/messages", {
    message_ids: messageIdsParam,
    allow_empty_topic_name: "true",
    client_gravatar: "true",
    apply_markdown: "false",
  });
  if (!res?.ok) {
    log.warn("fetchMessagesByIds: batch request not ok", {
      httpStatus: res?.status ?? null,
      result:
        res?.data != null && typeof res.data === "object"
          ? (res.data as { result?: string }).result
          : undefined,
      msg:
        res?.data != null && typeof res.data === "object"
          ? (res.data as { msg?: string }).msg
          : undefined,
    });
    return { messages: [], apiError: true };
  }
  const parsed = parseMessagesListResponse(res.data);
  if (parsed == null) {
    log.warn("fetchMessagesByIds: batch response parse error", {
      httpStatus: res.status,
      result:
        res.data != null && typeof res.data === "object"
          ? (res.data as { result?: string }).result
          : undefined,
      msg:
        res.data != null && typeof res.data === "object"
          ? (res.data as { msg?: string }).msg
          : undefined,
    });
    return { messages: [], apiError: true };
  }
  log.info("fetchMessagesByIds: batch response ok", {
    httpStatus: res.status,
    messageCount: parsed.length,
  });
  return { messages: parsed, apiError: false };
}

async function fetchMessagesByIdsFallback(messageIds: number[]): Promise<ZulipRawMessage[]> {
  if (!loggedMessageIdsBatchFallback) {
    loggedMessageIdsBatchFallback = true;
    log.warn("GET /messages message_ids unavailable; falling back to per-message fetch", {
      count: messageIds.length,
    });
  }
  const results: ZulipRawMessage[] = [];
  let nextIndex = 0;
  const workerCount = Math.min(MESSAGE_IDS_FALLBACK_CONCURRENCY, messageIds.length);
  const workers = Array.from({ length: workerCount }, async () => {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= messageIds.length) return;
      const messageId = messageIds[index]!;
      const res = await zulipPipelineGet(`/messages/${messageId}`, {
        allow_empty_topic_name: "true",
        apply_markdown: "false",
      });
      if (!res?.ok) continue;
      const message = zulipRawMessageFromGetMessageApiData(res.data);
      if (message != null) {
        results.push(message);
      }
    }
  });
  await Promise.all(workers);
  return results;
}

function getActivityNarrow(filter: ActivityFilter, currentUserId?: number | null): NarrowEntry[] {
  switch (filter) {
    case "starred":
      return [{ negated: false, operator: "is", operand: "starred" }];
    case "mentions":
      return [{ negated: false, operator: "is", operand: "mentioned" }];
    case "reactions":
      if (currentUserId == null) {
        return [{ negated: false, operator: "has", operand: "reaction" }];
      }
      return [
        { negated: false, operator: "has", operand: "reaction" },
        {
          negated: false,
          operator: "sender",
          operand: guard.userId(currentUserId, "fetchActivityMessagesPage.currentUserId"),
        },
      ];
    default:
      return [];
  }
}

/** Narrow for unread @mentions counter sync (AND: mentioned + unread). */
export const UNREAD_MENTIONS_NARROW: NarrowEntry[] = [
  { negated: false, operator: "is", operand: "mentioned" },
  { negated: false, operator: "is", operand: "unread" },
];

export const MENTIONS_UNREAD_SYNC_PAGE_SIZE = 200;

/** Fetches newest unread @mentions for sidebar badge authoritative reconcile. */
export async function fetchUnreadMentionsPage(
  numBefore = MENTIONS_UNREAD_SYNC_PAGE_SIZE,
  options?: { signal?: AbortSignal },
): Promise<MessagesPageResult> {
  return fetchMessagesWithNarrowPage(UNREAD_MENTIONS_NARROW, "newest", numBefore, 0, {
    applyMarkdown: false,
    signal: options?.signal,
  });
}

async function fetchMessageWindow(options: MessageWindowOptions): Promise<ZulipRawMessage[]> {
  const { anchor, numBefore, numAfter, includeAnchor, applyMarkdown = false } = options;
  const res = await zulipPipelineGet("/messages", {
    anchor: String(anchor),
    ...(includeAnchor == null ? {} : { include_anchor: includeAnchor ? "true" : "false" }),
    num_before: String(numBefore),
    num_after: String(numAfter),
    client_gravatar: "true",
    allow_empty_topic_name: "true",
    apply_markdown: applyMarkdown ? "true" : "false",
  });
  if (!res?.ok) return [];
  const data = res.data as { result?: string; messages?: ZulipRawMessage[] };
  if (!data || data.result === "error") return [];
  return data.messages ?? [];
}

/** Loads the latest messages without a narrow (default 1000). */
export async function fetchRecentMessages(numBefore = 1000): Promise<ZulipRawMessage[]> {
  return fetchMessageWindow({
    anchor: "newest",
    numBefore,
    numAfter: 0,
    applyMarkdown: false,
  });
}

/** Deep backfill: older chat-list messages before anchor. */
export async function fetchMessagesBeforeAnchor(
  anchorMessageId: number,
  numBefore = 5000,
): Promise<ZulipRawMessage[]> {
  guard.messageId(anchorMessageId, "fetchMessagesBeforeAnchor.anchorMessageId");
  return fetchMessageWindow({
    anchor: anchorMessageId,
    numBefore,
    numAfter: 0,
    includeAnchor: false,
    applyMarkdown: false,
  });
}

/** Loads newer chat-list messages after anchor (post-reconnect catch-up). */
export async function fetchMessagesAfterAnchor(
  anchorMessageId: number,
  numAfter = 5000,
): Promise<ZulipRawMessage[]> {
  guard.messageId(anchorMessageId, "fetchMessagesAfterAnchor.anchorMessageId");
  return fetchMessageWindow({
    anchor: anchorMessageId,
    numBefore: 0,
    numAfter,
    includeAnchor: false,
    applyMarkdown: false,
  });
}

/** Activity section narrows: starred, mentions, and reactions. */
export async function fetchActivityMessages(
  filter: ActivityFilter,
  currentUserId?: number | null,
  anchor: number | "newest" = "newest",
  numBefore = 200,
): Promise<ZulipRawMessage[]> {
  const page = await fetchActivityMessagesPage(filter, currentUserId, anchor, numBefore);
  return page.messages;
}

export async function fetchActivityMessagesPage(
  filter: ActivityFilter,
  currentUserId?: number | null,
  anchor: number | "newest" = "newest",
  numBefore = 200,
): Promise<ActivityMessagesPageResult> {
  const normalizedAnchor =
    anchor === "newest" ? anchor : guard.messageId(anchor, "fetchActivityMessagesPage.anchor");
  const narrow = getActivityNarrow(filter, currentUserId);
  const res = await zulipPipelineGet("/messages", {
    anchor: String(normalizedAnchor),
    num_before: String(numBefore),
    num_after: "0",
    narrow: JSON.stringify(narrow),
    allow_empty_topic_name: "true",
    client_gravatar: "true",
    apply_markdown: "false",
  });
  if (!res?.ok) return { messages: [], foundOldest: false };
  const data = res.data as {
    result?: string;
    messages?: ZulipRawMessage[];
    found_oldest?: boolean;
    foundOldest?: boolean;
  };
  if (!data || data.result === "error") return { messages: [], foundOldest: false };
  return {
    messages: data.messages ?? [],
    foundOldest: data.found_oldest ?? data.foundOldest ?? false,
  };
}

export { rawMessageToMockMessage };

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function throwIfZulipPipelineGetNull(
  response: Awaited<ReturnType<typeof zulipPipelineGet>> | null,
  signal?: AbortSignal,
): asserts response is NonNullable<Awaited<ReturnType<typeof zulipPipelineGet>>> {
  if (response != null) return;
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  throw new Error(t("app.networkError"));
}

function mapZulipMessage(m: RawMessageToMockInput): MockMessage {
  return rawMessageToMockMessage(m);
}

export async function fetchMessages(
  stream?: string,
  topic?: string,
  q?: string,
  options?: { signal?: AbortSignal },
): Promise<MockMessage[]> {
  const normalizedStream =
    stream == null ? undefined : guard.nonEmpty(stream, "fetchMessages.stream");
  const normalizedTopic = topic == null ? undefined : normalizeTopicForIdentity(topic);
  if (normalizedTopic !== undefined && normalizedStream === undefined) {
    throw new Error("fetchMessages.stream is required when topic is provided");
  }
  const narrow: { operator: string; operand: string }[] = [];
  if (normalizedStream) narrow.push({ operator: "stream", operand: normalizedStream });
  if (normalizedTopic !== undefined) {
    narrow.push({ operator: "topic", operand: zulipTopicNarrowOperandForApi(normalizedTopic) });
  }
  if (q?.trim()) narrow.push({ operator: "search", operand: q.trim() });
  const page = await fetchMessagesWithNarrowPage(
    narrow,
    "newest",
    ZULIP_STREAM_ANCHOR_NUM_BEFORE,
    ZULIP_STREAM_CHAT_NUM_AFTER,
    { ...options, applyMarkdown: false },
  );
  return page.messages;
}

/** Loads messages by narrow with configurable anchor and window sizes. */
export async function fetchMessagesWithNarrow(
  narrow: { operator: string; operand: string | number | number[] }[],
  anchor: string | number = "newest",
  numBefore = ZULIP_STREAM_ANCHOR_NUM_BEFORE,
  numAfter = ZULIP_STREAM_CHAT_NUM_AFTER,
  options?: { signal?: AbortSignal; applyMarkdown?: boolean },
): Promise<MockMessage[]> {
  const page = await fetchMessagesWithNarrowPage(narrow, anchor, numBefore, numAfter, options);
  return page.messages;
}

async function fetchMessagesWithNarrowPageViaPipeline(args: {
  apiNarrow: { operator: string; operand: string | number | number[] }[];
  validatedAnchor: string | number;
  validatedNumBefore: number;
  validatedNumAfter: number;
  applyMarkdown: boolean;
  signal: AbortSignal;
}): Promise<MessagesPageResult> {
  const query = buildMessagesQueryParams({
    narrow: args.apiNarrow.length > 0 ? args.apiNarrow : undefined,
    anchor: args.validatedAnchor,
    num_before: args.validatedNumBefore,
    num_after: args.validatedNumAfter,
  });
  query.apply_markdown = args.applyMarkdown ? "true" : "false";
  const response = await zulipPipelineGet("/messages", query, args.signal);
  throwIfZulipPipelineGetNull(response, args.signal);
  if (!response.ok) {
    throw new Error(t("app.errorStatus", { status: String(response.status) }));
  }
  const data = response.data as Parameters<typeof mapMessagesPageFromApiData>[0];
  if (args.signal.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  return mapMessagesPageFromApiData(data, mapZulipMessage);
}

async function fetchMessagesWithNarrowPageViaClient(args: {
  apiNarrow: { operator: string; operand: string | number | number[] }[];
  validatedAnchor: string | number;
  validatedNumBefore: number;
  validatedNumAfter: number;
  applyMarkdown: boolean;
}): Promise<MessagesPageResult> {
  const client = await getClient();
  const data = (await client.messages.retrieve({
    narrow: args.apiNarrow.length > 0 ? args.apiNarrow : undefined,
    anchor: args.validatedAnchor,
    num_before: args.validatedNumBefore,
    num_after: args.validatedNumAfter,
    apply_markdown: args.applyMarkdown,
  })) as Parameters<typeof mapMessagesPageFromApiData>[0];
  return mapMessagesPageFromApiData(data, mapZulipMessage);
}

/** Loads a narrow message page including pagination metadata. */
export async function fetchMessagesWithNarrowPage(
  narrow: { operator: string; operand: string | number | number[] }[],
  anchor: string | number = "newest",
  numBefore = ZULIP_STREAM_ANCHOR_NUM_BEFORE,
  numAfter = ZULIP_STREAM_CHAT_NUM_AFTER,
  options?: { signal?: AbortSignal; applyMarkdown?: boolean },
): Promise<MessagesPageResult> {
  const validatedAnchor = validateMessagesApiAnchor(anchor, "fetchMessagesWithNarrowPage");
  const validatedNumBefore = validateNonNegativeInteger(numBefore, "numBefore");
  const validatedNumAfter = validateNonNegativeInteger(numAfter, "numAfter");
  const applyMarkdown = options?.applyMarkdown ?? false;
  const apiNarrow = normalizeZulipMessagesNarrowForApi(narrow);
  if (options?.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  try {
    if (options?.signal) {
      return await fetchMessagesWithNarrowPageViaPipeline({
        apiNarrow,
        validatedAnchor,
        validatedNumBefore,
        validatedNumAfter,
        applyMarkdown,
        signal: options.signal,
      });
    }

    return await fetchMessagesWithNarrowPageViaClient({
      apiNarrow,
      validatedAnchor,
      validatedNumBefore,
      validatedNumAfter,
      applyMarkdown,
    });
  } catch (error) {
    if (isAbortError(error) || options?.signal?.aborted) {
      throw error;
    }
    if (options?.signal) {
      throw error instanceof Error ? error : new Error(t("app.networkError"));
    }
    return { messages: [], foundOldest: false, foundNewest: false };
  }
}

/** Loads one page of all messages (no narrow) via the API pipeline. */
export async function fetchAllMessagesPage(
  anchor: string | number = "newest",
  numBefore = 100,
  options?: { applyMarkdown?: boolean },
): Promise<MessagesPageResult> {
  const validatedAnchor = validateMessagesApiAnchor(anchor, "fetchAllMessagesPage");
  const validatedNumBefore = validateNonNegativeInteger(numBefore, "numBefore");
  const applyMarkdown = options?.applyMarkdown ?? false;
  const res = await zulipPipelineGet("/messages", {
    anchor: String(validatedAnchor),
    num_before: String(validatedNumBefore),
    num_after: "0",
    narrow: "[]",
    allow_empty_topic_name: "true",
    client_gravatar: "true",
    apply_markdown: applyMarkdown ? "true" : "false",
  });

  if (!res?.ok) {
    return { messages: [], foundOldest: false, foundNewest: false };
  }

  const data = res.data as {
    result?: string;
    msg?: string;
    messages?: ZulipRawMessage[];
    found_oldest?: boolean;
    foundOldest?: boolean;
    found_newest?: boolean;
    foundNewest?: boolean;
  };

  if (!data || data.result === "error") {
    return { messages: [], foundOldest: false, foundNewest: false };
  }

  return {
    messages: (data.messages ?? []).map(rawMessageToMockMessage),
    foundOldest: data.found_oldest ?? data.foundOldest ?? false,
    foundNewest: data.found_newest ?? data.foundNewest ?? false,
  };
}

interface DmNarrow {
  negated: false;
  operator: "dm";
  operand: number[];
}

const GROUP_DM_ID_OFFSET = 2_000_000;

/** Loads DM messages (1:1 or group); for 1:1 pass the peer `userId`. */
export async function fetchDmMessages(
  userIds: number | number[],
  options?: { signal?: AbortSignal },
): Promise<MockMessage[]> {
  const rawIds = Array.isArray(userIds) ? userIds : [userIds];
  if (rawIds.length === 0) return [];
  const ids = rawIds.map((userId, index) =>
    guard.userId(userId, `fetchDmMessages.userIds[${index}]`),
  );
  if (ids.some((id) => id >= GROUP_DM_ID_OFFSET)) return [];
  if (options?.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  const params = {
    narrow: [{ negated: false, operator: "dm", operand: ids }] as DmNarrow[],
    anchor: "newest",
    num_before: ZULIP_DM_ANCHOR_NUM_BEFORE,
    num_after: ZULIP_DM_CHAT_NUM_AFTER,
    client_gravatar: true,
    allow_empty_topic_name: true,
    apply_markdown: true,
  };
  try {
    if (options?.signal) {
      const response = await zulipPipelineGet(
        "/messages",
        buildMessagesQueryParams({
          narrow: params.narrow,
          anchor: params.anchor,
          num_before: params.num_before,
          num_after: params.num_after,
        }),
        options.signal,
      );
      throwIfZulipPipelineGetNull(response, options.signal);
      if (!response.ok) {
        throw new Error(t("app.errorStatus", { status: String(response.status) }));
      }
      const data = response.data as { result?: string; messages?: RawMessageToMockInput[] };
      if (data.result === "error") return [];
      if (options.signal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      return (data.messages ?? []).map(mapZulipMessage);
    }

    const client = await getClient();
    const data = await client.messages.retrieve(params);
    const raw = data as { result?: string; messages?: RawMessageToMockInput[] };
    if (raw.result === "error") return [];
    const list = raw.messages ?? [];
    return list.map(mapZulipMessage);
  } catch (error) {
    if (isAbortError(error) || options?.signal?.aborted) {
      throw error;
    }
    if (options?.signal) {
      throw error instanceof Error ? error : new Error(t("app.networkError"));
    }
    return [];
  }
}

/**
 * Fetches specific messages by id (Zulip 10+ `message_ids` on GET /messages).
 * Falls back to per-id GET when the server rejects batch fetch.
 */
export async function fetchMessagesByIds(messageIds: number[]): Promise<ZulipRawMessage[]> {
  log.info("fetchMessagesByIds: called", { inputCount: messageIds.length });

  const uniqueIds = [
    ...new Set(messageIds.filter((messageId) => Number.isInteger(messageId) && messageId > 0)),
  ];
  if (uniqueIds.length === 0) {
    log.info("fetchMessagesByIds: no positive ids after filter", { inputCount: messageIds.length });
    return [];
  }

  const validatedIds = validateMessageIds(uniqueIds, "fetchMessagesByIds");
  const collected: ZulipRawMessage[] = [];
  let useFallback = false;

  log.info("fetchMessagesByIds: fetching chunks", {
    validatedCount: validatedIds.length,
    chunkSize: MESSAGE_IDS_CHUNK_SIZE,
  });

  for (let offset = 0; offset < validatedIds.length; offset += MESSAGE_IDS_CHUNK_SIZE) {
    const chunk = validatedIds.slice(offset, offset + MESSAGE_IDS_CHUNK_SIZE);
    const { messages, apiError } = await fetchMessagesByIdsChunk(chunk);
    if (apiError) {
      log.warn("fetchMessagesByIds: switching to per-id fallback", {
        chunkOffset: offset,
        chunkSize: chunk.length,
      });
      useFallback = true;
      break;
    }
    collected.push(...messages);
  }

  if (useFallback) {
    const fallbackMessages = await fetchMessagesByIdsFallback(validatedIds);
    log.info("fetchMessagesByIds: fallback complete", {
      requestedCount: validatedIds.length,
      fetchedCount: fallbackMessages.length,
    });
    return fallbackMessages;
  }

  const foundIds = new Set(collected.map((message) => message.id));
  const missingIds = validatedIds.filter((messageId) => !foundIds.has(messageId));
  if (missingIds.length > 0) {
    log.info("fetchMessagesByIds: recovering missing ids via fallback", {
      missingCount: missingIds.length,
      missingSample: missingIds.slice(0, 8),
    });
    const recovered = await fetchMessagesByIdsFallback(missingIds);
    collected.push(...recovered);
  }

  log.info("fetchMessagesByIds: done", {
    requestedCount: validatedIds.length,
    fetchedCount: collected.length,
  });

  return collected;
}

/** Loads one message by id; returns null on error or non-ok response. */
export async function fetchMessageById(messageId: number): Promise<MockMessage | null> {
  guard.messageId(messageId, "fetchMessageById");
  const res = await zulipPipelineGet(`/messages/${messageId}`, {
    allow_empty_topic_name: "true",
    apply_markdown: "false",
  });
  if (!res?.ok) {
    return null;
  }
  return mockMessageFromGetMessageApiData(res.data);
}

/** Server-rendered HTML for one message (includes `.message_embed` when link previews are enabled). */
export async function fetchMessageRenderedHtmlById(
  messageId: number,
  signal?: AbortSignal,
): Promise<string | null> {
  guard.messageId(messageId, "fetchMessageRenderedHtmlById");
  const res = await zulipPipelineGet(
    `/messages/${messageId}`,
    {
      allow_empty_topic_name: "true",
      apply_markdown: "true",
    },
    signal,
  );
  if (!res?.ok) {
    return null;
  }
  const data = res.data as {
    result?: string;
    message?: { content?: string };
    content?: string;
  };
  if (data.result === "error") {
    return null;
  }
  let content: string | null = null;
  if (typeof data.message?.content === "string") {
    content = data.message.content;
  } else if (typeof data.content === "string") {
    content = data.content;
  }
  const trimmed = content?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export async function fetchSavedSnippets(): Promise<SavedSnippet[]> {
  const res = await zulipPipelineGet("/saved_snippets");
  if (!res?.ok) {
    throw new Error(t("app.errorStatus", { status: String(res?.status ?? 0) }));
  }
  const data = res.data as { result?: string; msg?: string; saved_snippets?: unknown[] };
  if (data.result === "error") {
    throw new Error(data.msg ?? t("app.unknownError"));
  }
  if (!Array.isArray(data.saved_snippets)) {
    return [];
  }
  const snippets: SavedSnippet[] = [];
  for (const item of data.saved_snippets) {
    if (item == null || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "number" ? row.id : 0;
    const title = typeof row.title === "string" ? row.title : "";
    const content = typeof row.content === "string" ? row.content : "";
    let dateCreated = 0;
    if (typeof row.date_created === "number") {
      dateCreated = row.date_created;
    } else if (typeof row.dateCreated === "number") {
      dateCreated = row.dateCreated;
    }
    if (id <= 0 || title.trim().length === 0 || content.trim().length === 0) continue;
    snippets.push({
      id,
      title,
      content,
      date_created: dateCreated,
    });
  }
  snippets.sort((left, right) => left.title.localeCompare(right.title));
  return snippets;
}

export async function createSavedSnippet(params: CreateSavedSnippetParams): Promise<number> {
  const title = guard.nonEmpty(params.title.trim(), "createSavedSnippet.title");
  const content = guard.nonEmpty(params.content.trim(), "createSavedSnippet.content");
  const res = await zulipPipelinePost("/saved_snippets", { title, content });
  const data = res.data as { result?: string; msg?: string; saved_snippet_id?: number };
  if (!res.ok || data.result === "error") {
    throw new Error(data.msg ?? t("app.errorStatus", { status: String(res.status) }));
  }
  return data.saved_snippet_id ?? 0;
}

export async function sendMessage(params: SendMessageParams): Promise<MockMessage> {
  const isPrivate = params.to != null && params.to.length > 0;
  if (!isPrivate && !params.stream) {
    throw new Error(t("message.sendRequiresStreamOrTo"));
  }
  const content = guard.nonEmpty(params.content, "sendMessage.content");
  const sendOptions =
    params.local_id != null && params.local_id.trim().length > 0
      ? { localId: params.local_id.trim() }
      : undefined;

  if (isPrivate) {
    const recipients = params.to ?? [];
    for (const recipientId of recipients) {
      guard.userId(recipientId, "sendMessage.to");
    }
    const result = await postZulipSendMessage(
      {
        type: "private",
        to: recipients,
        content,
      },
      sendOptions,
    );
    const id = result.id ?? 0;
    const authoritative = id > 0 ? await fetchMessageById(id) : null;
    if (authoritative) return authoritative;
    return {
      id,
      sender_id: params.sender_id ?? 0,
      sender_full_name: params.sender_full_name ?? t("common.you"),
      stream_id: null,
      display_recipient: recipients.map((recipientId) => ({ id: recipientId, full_name: "" })),
      subject: "",
      content,
      timestamp: Math.floor(Date.now() / 1000),
    };
  }

  const stream = guard.nonEmpty(params.stream, "sendMessage.stream");
  if (params.streamId != null) {
    guard.streamId(params.streamId, "sendMessage.streamId");
  }
  const subject = params.subject ?? "";
  const result = await postZulipSendMessage(
    {
      type: "stream",
      to: stream,
      topic: subject,
      content,
    },
    sendOptions,
  );
  const id = result.id ?? 0;
  const authoritative = id > 0 ? await fetchMessageById(id) : null;
  if (authoritative) return authoritative;
  return {
    id,
    sender_id: params.sender_id ?? 0,
    sender_full_name: params.sender_full_name ?? t("common.you"),
    stream_id: params.streamId ?? null,
    display_recipient: stream,
    channel: stream,
    subject,
    content,
    timestamp: Math.floor(Date.now() / 1000),
  };
}

/** Renders markdown via Zulip for composer preview. */
export async function renderMessageContent(content: string): Promise<string> {
  const normalizedContent = guard.nonEmpty(content, "renderMessageContent.content");
  const res = await zulipPipelinePost("messages/render", { content: normalizedContent });
  const data = res.data as { result?: string; msg?: string; rendered?: string };
  if (!res.ok || data.result === "error") {
    throw new Error(data.msg ?? t("app.errorStatus", { status: String(res.status) }));
  }
  if (typeof data.rendered !== "string") {
    throw new Error(t("app.invalidResponse"));
  }
  return data.rendered;
}

export async function updateMessage(messageId: number, params: { content: string }): Promise<void> {
  guard.messageId(messageId, "updateMessage");
  const content = guard.nonEmpty(params.content, "updateMessage.content");
  const res = await zulipPipelinePatch(`messages/${messageId}`, {
    content,
  });
  if (!res.ok) {
    const data = res.data as { msg?: string };
    throw new Error(data.msg ?? t("app.errorStatus", { status: String(res.status) }));
  }
}

export async function deleteMessage(messageId: number): Promise<void> {
  guard.messageId(messageId, "deleteMessage");
  const res = await zulipPipelineDelete(`messages/${messageId}`);
  if (!res.ok) {
    const data = res.data as { msg?: string };
    throw new Error(data.msg ?? t("app.errorStatus", { status: String(res.status) }));
  }
}

export async function addReaction(
  messageId: number,
  emojiName: string,
  options?: ReactionType | { emojiCode?: string; reactionType?: ReactionType },
): Promise<void> {
  guard.messageId(messageId, "addReaction");
  const normalizedEmojiName = guard.nonEmpty(emojiName, "addReaction.emojiName");
  const normalizedOptions =
    typeof options === "string" ? { reactionType: options } : (options ?? undefined);
  const reactionType = normalizedOptions?.reactionType ?? "unicode_emoji";
  const body: Record<string, string> = {
    emoji_name: normalizedEmojiName,
    reaction_type: reactionType,
  };
  if (normalizedOptions?.emojiCode) {
    body.emoji_code = normalizedOptions.emojiCode;
  }
  const res = await zulipPipelinePost(`messages/${messageId}/reactions`, body);
  if (!res.ok) {
    const data = res.data as { msg?: string; code?: string };
    if (data.code === "REACTION_ALREADY_EXISTS") return;
    throw new Error(data.msg ?? t("app.errorStatus", { status: String(res.status) }));
  }
}

export async function removeReaction(
  messageId: number,
  emojiName: string,
  options?: { emojiCode?: string; reactionType?: ReactionType },
): Promise<void> {
  guard.messageId(messageId, "removeReaction");
  const normalizedEmojiName = guard.nonEmpty(emojiName, "removeReaction.emojiName");
  const body: Record<string, string> = { emoji_name: normalizedEmojiName };
  if (options?.emojiCode) body.emoji_code = options.emojiCode;
  if (options?.reactionType) body.reaction_type = options.reactionType;
  const res = await zulipPipelineDelete(`messages/${messageId}/reactions`, body);
  if (!res.ok) {
    const data = res.data as { msg?: string };
    throw new Error(data.msg ?? t("app.errorStatus", { status: String(res.status) }));
  }
}

export async function updateMessageFlags(
  messageIds: number[],
  op: "add" | "remove",
  flag: string,
): Promise<void> {
  if (messageIds.length === 0) return;
  const validatedMessageIds = validateMessageIds(messageIds, "updateMessageFlags.messageIds");
  const validatedFlag = guard.nonEmpty(flag, "updateMessageFlags.flag");
  await zulipPipelinePost("messages/flags", {
    messages: JSON.stringify(validatedMessageIds),
    op,
    flag: validatedFlag,
  });
}

export async function addMessageFlag(messageIds: number[], flag: string): Promise<void> {
  await updateMessageFlags(messageIds, "add", flag);
}

export async function removeMessageFlag(messageIds: number[], flag: string): Promise<void> {
  await updateMessageFlags(messageIds, "remove", flag);
}
