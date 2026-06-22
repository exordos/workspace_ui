/**
 * messenger messages API: load, send, edit, reactions, flags, snippets, and activity narrows.
 */
import { t } from "~/i18n/i18n";
import { guard } from "~/shared/lib/guards";
import { createLogger } from "~/shared/lib/logger";
import { createMessageId, normalizeMessageId } from "~/shared/lib/message-id.lib";
import type { MessageId } from "~/shared/lib/message-id.lib";
import {
  MESSENGER_DM_CHAT_NUM_AFTER,
  MESSENGER_DM_ANCHOR_NUM_BEFORE,
  MESSENGER_STREAM_ANCHOR_NUM_BEFORE,
  MESSENGER_STREAM_CHAT_NUM_AFTER,
} from "~/shared/lib/messenger-message-window.lib";
import {
  normalizeMessengerMessagesNarrowForApi,
  messengerTopicNarrowOperandForApi,
  type MessengerMessagesNarrowClause,
} from "~/shared/lib/messenger-topic-narrow.lib";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import { numericUserIdOrNull, type UserId } from "~/shared/lib/user-id.lib";
import { buildMessagesQueryParams } from "./messenger-client.internal";
import {
  mockMessageFromGetMessageApiData,
  rawMessageToMockMessage,
} from "./messenger-message-map.lib";
import { postWorkspaceSendMessage } from "./messenger-message-send.internal";
import { mapMessagesPageFromApiData } from "./messenger-messages-page.lib";
import {
  messengerPipelineDelete,
  messengerPipelineGet,
  messengerPipelinePatch,
  messengerPipelinePost,
} from "./messenger-pipeline.internal";
import {
  validateMessageIds,
  validateMessagesApiAnchor,
  validateNonNegativeInteger,
} from "./messenger-validation.internal";
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
  WorkspaceRawMessage,
} from "./messenger.types";

const activityMessagesLog = createLogger("api:activity-messages");

interface MessageWindowOptions {
  anchor: string;
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

const log = createLogger("api:messenger-messages");

/** Workspace allows up to 5000 messages per GET /messages request. */
const MESSAGE_IDS_CHUNK_SIZE = 1000;
const MESSAGE_IDS_FALLBACK_CONCURRENCY = 8;

let loggedMessageIdsBatchFallback = false;

function parseMessagesListResponse(data: unknown): WorkspaceRawMessage[] | null {
  if (data == null || typeof data !== "object") return null;
  const payload = data as { result?: string; messages?: WorkspaceRawMessage[] };
  if (payload.result === "error") return null;
  return payload.messages ?? [];
}

function messengerRawMessageFromGetMessageApiData(data: unknown): WorkspaceRawMessage | null {
  if (data == null || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  if (row.result === "error") return null;
  if (row.message != null && typeof row.message === "object") {
    const message = row.message as WorkspaceRawMessage;
    return normalizeMessageId(message.id) != null ? message : null;
  }
  if (normalizeMessageId(row.id) != null) {
    return row as unknown as WorkspaceRawMessage;
  }
  return null;
}

async function fetchMessagesByIdsChunk(messageIds: MessageId[]): Promise<{
  messages: WorkspaceRawMessage[];
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
  const res = await messengerPipelineGet("/messages", {
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

async function fetchMessagesByIdsFallback(messageIds: MessageId[]): Promise<WorkspaceRawMessage[]> {
  if (!loggedMessageIdsBatchFallback) {
    loggedMessageIdsBatchFallback = true;
    log.warn("GET /messages message_ids unavailable; falling back to per-message fetch", {
      count: messageIds.length,
    });
  }
  const results: WorkspaceRawMessage[] = [];
  let nextIndex = 0;
  const workerCount = Math.min(MESSAGE_IDS_FALLBACK_CONCURRENCY, messageIds.length);
  const workers = Array.from({ length: workerCount }, async () => {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= messageIds.length) return;
      const messageId = messageIds[index]!;
      const res = await messengerPipelineGet(`/messages/${messageId}`, {
        allow_empty_topic_name: "true",
        apply_markdown: "false",
      });
      if (!res?.ok) continue;
      const message = messengerRawMessageFromGetMessageApiData(res.data);
      if (message != null) {
        results.push(message);
      }
    }
  });
  await Promise.all(workers);
  return results;
}

function getActivityNarrow(filter: ActivityFilter, currentUserId?: UserId | null): NarrowEntry[] {
  switch (filter) {
    case "starred":
      return [{ negated: false, operator: "is", operand: "starred" }];
    case "mentions":
      return [{ negated: false, operator: "is", operand: "mentioned" }];
    case "reactions": {
      const numericCurrentUserId = numericUserIdOrNull(currentUserId);
      if (numericCurrentUserId == null) {
        return [];
      }
      return [
        { negated: false, operator: "has", operand: "reaction" },
        {
          negated: false,
          operator: "sender",
          operand: guard.userId(numericCurrentUserId, "fetchActivityMessagesPage.currentUserId"),
        },
      ];
    }
    default:
      return [];
  }
}

async function fetchMessageWindow(options: MessageWindowOptions): Promise<WorkspaceRawMessage[]> {
  const { anchor, numBefore, numAfter, includeAnchor, applyMarkdown = false } = options;
  const res = await messengerPipelineGet("/messages", {
    anchor: String(anchor),
    ...(includeAnchor == null ? {} : { include_anchor: includeAnchor ? "true" : "false" }),
    num_before: String(numBefore),
    num_after: String(numAfter),
    client_gravatar: "true",
    allow_empty_topic_name: "true",
    apply_markdown: applyMarkdown ? "true" : "false",
  });
  if (!res?.ok) return [];
  const data = res.data as { result?: string; messages?: WorkspaceRawMessage[] };
  if (!data || data.result === "error") return [];
  return data.messages ?? [];
}

/** Loads the latest messages without a narrow (default 1000). */
export async function fetchRecentMessages(numBefore = 1000): Promise<WorkspaceRawMessage[]> {
  return fetchMessageWindow({
    anchor: "newest",
    numBefore,
    numAfter: 0,
    applyMarkdown: false,
  });
}

/** Deep backfill: older chat-list messages before anchor. */
export async function fetchMessagesBeforeAnchor(
  anchorMessageId: MessageId,
  numBefore = 5000,
): Promise<WorkspaceRawMessage[]> {
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
  anchorMessageId: MessageId,
  numAfter = 5000,
): Promise<WorkspaceRawMessage[]> {
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
  currentUserId?: UserId | null,
  anchor: MessageId = "newest",
  numBefore = 200,
  options?: { signal?: AbortSignal },
): Promise<WorkspaceRawMessage[]> {
  const page = await fetchActivityMessagesPage(filter, currentUserId, anchor, numBefore, options);
  return page.messages;
}

export async function fetchActivityMessagesPage(
  filter: ActivityFilter,
  currentUserId?: UserId | null,
  anchor: MessageId = "newest",
  numBefore = 200,
  options?: { signal?: AbortSignal },
): Promise<ActivityMessagesPageResult> {
  const normalizedAnchor =
    anchor === "newest" ? anchor : guard.messageId(anchor, "fetchActivityMessagesPage.anchor");
  const narrow = getActivityNarrow(filter, currentUserId);
  if (filter === "reactions" && narrow.length === 0) {
    return { messages: [], foundOldest: true };
  }
  if (options?.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  try {
    const res = await messengerPipelineGet(
      "/messages",
      {
        anchor: String(normalizedAnchor),
        num_before: String(numBefore),
        num_after: "0",
        narrow: JSON.stringify(narrow),
        allow_empty_topic_name: "true",
        client_gravatar: "true",
        apply_markdown: "false",
      },
      options?.signal,
    );
    throwIfWorkspacePipelineGetNull(res, options?.signal);
    if (!res.ok) {
      const errData = res.data as { msg?: string } | undefined;
      const status = res.status;
      const msg = errData?.msg ?? `Activity messages request failed (${status ?? "unknown"})`;
      activityMessagesLog.warn("Activity messages fetch HTTP error", { filter, status });
      throw new Error(msg);
    }
    const data = res.data as {
      result?: string;
      msg?: string;
      messages?: WorkspaceRawMessage[];
      found_oldest?: boolean;
      foundOldest?: boolean;
    };
    if (options?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    if (!data || data.result === "error") {
      const msg = data?.msg ?? "Activity messages fetch error";
      activityMessagesLog.warn("Activity messages API error", { filter, msg });
      throw new Error(msg);
    }
    return {
      messages: data.messages ?? [],
      foundOldest: data.found_oldest ?? data.foundOldest ?? false,
    };
  } catch (error) {
    if (isAbortError(error) || options?.signal?.aborted) {
      throw error;
    }
    throw error instanceof Error ? error : new Error(t("app.networkError"));
  }
}

export { rawMessageToMockMessage };

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function throwIfWorkspacePipelineGetNull(
  response: Awaited<ReturnType<typeof messengerPipelineGet>> | null,
  signal?: AbortSignal,
): asserts response is NonNullable<Awaited<ReturnType<typeof messengerPipelineGet>>> {
  if (response != null) return;
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  throw new Error(t("app.networkError"));
}

function mapMessengerMessage(m: RawMessageToMockInput): MockMessage {
  return rawMessageToMockMessage(m);
}

function mapMarkdownModeMessengerMessage(m: RawMessageToMockInput): MockMessage {
  return rawMessageToMockMessage({
    ...m,
    markdown_source: m.markdown_source ?? m.content,
  });
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
    narrow.push({ operator: "topic", operand: messengerTopicNarrowOperandForApi(normalizedTopic) });
  }
  if (q?.trim()) narrow.push({ operator: "search", operand: q.trim() });
  const page = await fetchMessagesWithNarrowPage(
    narrow,
    "newest",
    MESSENGER_STREAM_ANCHOR_NUM_BEFORE,
    MESSENGER_STREAM_CHAT_NUM_AFTER,
    { ...options, applyMarkdown: false },
  );
  return page.messages;
}

/** Loads messages by narrow with configurable anchor and window sizes. */
export async function fetchMessagesWithNarrow(
  narrow: MessengerMessagesNarrowClause[],
  anchor: MessageId = "newest",
  numBefore = MESSENGER_STREAM_ANCHOR_NUM_BEFORE,
  numAfter = MESSENGER_STREAM_CHAT_NUM_AFTER,
  options?: { signal?: AbortSignal; applyMarkdown?: boolean },
): Promise<MockMessage[]> {
  const page = await fetchMessagesWithNarrowPage(narrow, anchor, numBefore, numAfter, options);
  return page.messages;
}

async function fetchMessagesWithNarrowPageViaPipeline(args: {
  apiNarrow: MessengerMessagesNarrowClause[];
  validatedAnchor: string;
  validatedNumBefore: number;
  validatedNumAfter: number;
  applyMarkdown: boolean;
  signal?: AbortSignal;
}): Promise<MessagesPageResult> {
  const query = buildMessagesQueryParams({
    narrow: args.apiNarrow.length > 0 ? args.apiNarrow : undefined,
    anchor: args.validatedAnchor,
    num_before: args.validatedNumBefore,
    num_after: args.validatedNumAfter,
  });
  query.apply_markdown = args.applyMarkdown ? "true" : "false";
  const response = await messengerPipelineGet("/messages", query, args.signal);
  throwIfWorkspacePipelineGetNull(response, args.signal);
  if (!response.ok) {
    throw new Error(t("app.errorStatus", { status: String(response.status) }));
  }
  const data = response.data as Parameters<typeof mapMessagesPageFromApiData>[0];
  if (args.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  return mapMessagesPageFromApiData(
    data,
    args.applyMarkdown ? mapMessengerMessage : mapMarkdownModeMessengerMessage,
  );
}

/** Loads a narrow message page including pagination metadata. */
export async function fetchMessagesWithNarrowPage(
  narrow: MessengerMessagesNarrowClause[],
  anchor: MessageId = "newest",
  numBefore = MESSENGER_STREAM_ANCHOR_NUM_BEFORE,
  numAfter = MESSENGER_STREAM_CHAT_NUM_AFTER,
  options?: { signal?: AbortSignal; applyMarkdown?: boolean },
): Promise<MessagesPageResult> {
  const validatedAnchor = validateMessagesApiAnchor(anchor, "fetchMessagesWithNarrowPage");
  const validatedNumBefore = validateNonNegativeInteger(numBefore, "numBefore");
  const validatedNumAfter = validateNonNegativeInteger(numAfter, "numAfter");
  const applyMarkdown = options?.applyMarkdown ?? false;
  const apiNarrow = normalizeMessengerMessagesNarrowForApi(narrow);
  if (options?.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  try {
    return await fetchMessagesWithNarrowPageViaPipeline({
      apiNarrow,
      validatedAnchor,
      validatedNumBefore,
      validatedNumAfter,
      applyMarkdown,
      signal: options?.signal,
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
  anchor: MessageId = "newest",
  numBefore = 100,
  options?: { applyMarkdown?: boolean; signal?: AbortSignal },
): Promise<MessagesPageResult> {
  const validatedAnchor = validateMessagesApiAnchor(anchor, "fetchAllMessagesPage");
  const validatedNumBefore = validateNonNegativeInteger(numBefore, "numBefore");
  const applyMarkdown = options?.applyMarkdown ?? false;
  if (options?.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  try {
    const res = await messengerPipelineGet(
      "/messages",
      {
        anchor: String(validatedAnchor),
        num_before: String(validatedNumBefore),
        num_after: "0",
        narrow: "[]",
        allow_empty_topic_name: "true",
        client_gravatar: "true",
        apply_markdown: applyMarkdown ? "true" : "false",
      },
      options?.signal,
    );
    throwIfWorkspacePipelineGetNull(res, options?.signal);

    if (!res.ok) {
      return { messages: [], foundOldest: false, foundNewest: false };
    }

    const data = res.data as {
      result?: string;
      msg?: string;
      messages?: WorkspaceRawMessage[];
      found_oldest?: boolean;
      foundOldest?: boolean;
      found_newest?: boolean;
      foundNewest?: boolean;
    };

    if (options?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    if (!data || data.result === "error") {
      return { messages: [], foundOldest: false, foundNewest: false };
    }

    return {
      messages: (data.messages ?? []).map((message) =>
        options?.applyMarkdown
          ? rawMessageToMockMessage(message)
          : rawMessageToMockMessage({
              ...message,
              markdown_source: message.markdown_source ?? message.content,
            }),
      ),
      foundOldest: data.found_oldest ?? data.foundOldest ?? false,
      foundNewest: data.found_newest ?? data.foundNewest ?? false,
    };
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

interface DmNarrow {
  negated: false;
  operator: "dm";
  operand: UserId[];
}

/** Loads 1:1 DM messages; pass the peer `userId`. */
export async function fetchDmMessages(
  userIds: UserId | UserId[],
  options?: { signal?: AbortSignal },
): Promise<MockMessage[]> {
  const rawIds = Array.isArray(userIds) ? userIds : [userIds];
  if (rawIds.length === 0) return [];
  const ids = rawIds.map((userId, index) =>
    guard.userIdentity(userId, `fetchDmMessages.userIds[${index}]`),
  );
  if (options?.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  const params = {
    narrow: [{ negated: false, operator: "dm", operand: ids }] as DmNarrow[],
    anchor: "newest",
    num_before: MESSENGER_DM_ANCHOR_NUM_BEFORE,
    num_after: MESSENGER_DM_CHAT_NUM_AFTER,
    client_gravatar: true,
    allow_empty_topic_name: true,
    apply_markdown: true,
  };
  try {
    const response = await messengerPipelineGet(
      "/messages",
      buildMessagesQueryParams({
        narrow: params.narrow,
        anchor: params.anchor,
        num_before: params.num_before,
        num_after: params.num_after,
      }),
      options?.signal,
    );
    throwIfWorkspacePipelineGetNull(response, options?.signal);
    if (!response.ok) {
      throw new Error(t("app.errorStatus", { status: String(response.status) }));
    }
    const data = response.data as { result?: string; messages?: RawMessageToMockInput[] };
    if (data.result === "error") return [];
    if (options?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    return (data.messages ?? []).map(rawMessageToMockMessage);
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
 * Fetches specific messages by id (messenger 10+ `message_ids` on GET /messages).
 * Falls back to per-id GET when the server rejects batch fetch.
 */
export async function fetchMessagesByIds(messageIds: MessageId[]): Promise<WorkspaceRawMessage[]> {
  log.info("fetchMessagesByIds: called", { inputCount: messageIds.length });

  const uniqueIds = [...new Set(messageIds.map(normalizeMessageId).filter((id) => id != null))];
  if (uniqueIds.length === 0) {
    log.info("fetchMessagesByIds: no valid ids after filter", { inputCount: messageIds.length });
    return [];
  }

  const validatedIds = validateMessageIds(uniqueIds, "fetchMessagesByIds");
  const collected: WorkspaceRawMessage[] = [];
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
export async function fetchMessageById(messageId: MessageId): Promise<MockMessage | null> {
  guard.messageId(messageId, "fetchMessageById");
  const res = await messengerPipelineGet(`/messages/${messageId}`, {
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
  messageId: MessageId,
  signal?: AbortSignal,
): Promise<string | null> {
  guard.messageId(messageId, "fetchMessageRenderedHtmlById");
  const res = await messengerPipelineGet(
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
  const res = await messengerPipelineGet("/saved_snippets");
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
  const res = await messengerPipelinePost("/saved_snippets", { title, content });
  const data = res.data as { result?: string; msg?: string; saved_snippet_id?: number };
  if (!res.ok || data.result === "error") {
    throw new Error(data.msg ?? t("app.errorStatus", { status: String(res.status) }));
  }
  return data.saved_snippet_id ?? 0;
}

export async function sendMessage(params: SendMessageParams): Promise<MockMessage> {
  const content = guard.nonEmpty(params.content, "sendMessage.content");
  const messageUuid = guard.messageId(params.messageUuid ?? createMessageId(), "sendMessage.uuid");
  const streamUuid = guard.streamUuid(params.streamUuid, "sendMessage.streamUuid");
  const topicUuid =
    params.topicUuid != null ? guard.streamUuid(params.topicUuid, "sendMessage.topicUuid") : null;

  const result = await postWorkspaceSendMessage({
    messageUuid,
    streamUuid,
    ...(topicUuid != null ? { topicUuid } : {}),
    content,
  });
  const streamName = params.stream?.trim() ?? "";
  const timestamp =
    result.createdAt != null && Number.isFinite(Date.parse(result.createdAt))
      ? Math.floor(Date.parse(result.createdAt) / 1000)
      : Math.floor(Date.now() / 1000);
  const authorId = params.author_id ?? params.sender_id;
  const numericSenderId = numericUserIdOrNull(authorId) ?? params.sender_id ?? 0;
  const authorUuid = typeof authorId === "string" ? authorId : undefined;
  const message: MockMessage = {
    id: result.messageUuid,
    source_message_uuid: result.messageUuid,
    sender_id: numericSenderId,
    ...(authorUuid != null ? { author_uuid: authorUuid, sender_uuid: authorUuid } : {}),
    is_own: result.isOwn ?? true,
    sender_full_name: params.sender_full_name ?? t("common.you"),
    stream_uuid: result.streamUuid,
    subject: params.subject ?? "",
    ...(result.topicUuid != null ? { topic_uuid: result.topicUuid } : {}),
    content: result.content,
    markdown_source: result.content,
    timestamp,
  };
  if (streamName.length > 0) {
    message.display_recipient = streamName;
    message.channel = streamName;
  }
  return message;
}

/** Renders markdown via Workspace for composer preview. */
export async function renderMessageContent(content: string): Promise<string> {
  const normalizedContent = guard.nonEmpty(content, "renderMessageContent.content");
  const res = await messengerPipelinePost("messages/render", { content: normalizedContent });
  const data = res.data as { result?: string; msg?: string; rendered?: string };
  if (!res.ok || data.result === "error") {
    throw new Error(data.msg ?? t("app.errorStatus", { status: String(res.status) }));
  }
  if (typeof data.rendered !== "string") {
    throw new Error(t("app.invalidResponse"));
  }
  return data.rendered;
}

export async function updateMessage(
  messageId: MessageId,
  params: { content: string },
): Promise<void> {
  guard.messageId(messageId, "updateMessage");
  const content = guard.nonEmpty(params.content, "updateMessage.content");
  const res = await messengerPipelinePatch(`messages/${messageId}`, {
    content,
  });
  if (!res.ok) {
    const data = res.data as { msg?: string };
    throw new Error(data.msg ?? t("app.errorStatus", { status: String(res.status) }));
  }
}

export async function deleteMessage(messageId: MessageId): Promise<void> {
  guard.messageId(messageId, "deleteMessage");
  const res = await messengerPipelineDelete(`messages/${messageId}`);
  if (!res.ok) {
    const data = res.data as { msg?: string };
    throw new Error(data.msg ?? t("app.errorStatus", { status: String(res.status) }));
  }
}

export async function addReaction(
  messageId: MessageId,
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
  const res = await messengerPipelinePost(`messages/${messageId}/reactions`, body);
  if (!res.ok) {
    const data = res.data as { msg?: string; code?: string };
    if (data.code === "REACTION_ALREADY_EXISTS") return;
    throw new Error(data.msg ?? t("app.errorStatus", { status: String(res.status) }));
  }
}

export async function removeReaction(
  messageId: MessageId,
  emojiName: string,
  options?: { emojiCode?: string; reactionType?: ReactionType },
): Promise<void> {
  guard.messageId(messageId, "removeReaction");
  const normalizedEmojiName = guard.nonEmpty(emojiName, "removeReaction.emojiName");
  const body: Record<string, string> = { emoji_name: normalizedEmojiName };
  if (options?.emojiCode) body.emoji_code = options.emojiCode;
  if (options?.reactionType) body.reaction_type = options.reactionType;
  const res = await messengerPipelineDelete(`messages/${messageId}/reactions`, body);
  if (!res.ok) {
    const data = res.data as { msg?: string };
    throw new Error(data.msg ?? t("app.errorStatus", { status: String(res.status) }));
  }
}

export function updateMessageFlags(
  messageIds: MessageId[],
  op: "add" | "remove",
  flag: string,
): Promise<void> {
  if (messageIds.length === 0) return Promise.resolve();
  const validatedMessageIds = validateMessageIds(messageIds, "updateMessageFlags.messageIds");
  const validatedFlag = guard.nonEmpty(flag, "updateMessageFlags.flag");
  log.warn("message flag write is not available in the new backend yet", {
    count: validatedMessageIds.length,
    op,
    flag: validatedFlag,
  });
  return Promise.reject(new Error("Message flag write API is not available in the new backend"));
}

export async function addMessageFlag(messageIds: MessageId[], flag: string): Promise<void> {
  await updateMessageFlags(messageIds, "add", flag);
}

export async function removeMessageFlag(messageIds: MessageId[], flag: string): Promise<void> {
  await updateMessageFlags(messageIds, "remove", flag);
}
