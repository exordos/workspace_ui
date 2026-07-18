/**
 * messenger messages API: load, send, edit, reactions, flags, snippets, and activity narrows.
 */
import { t } from "~/i18n/i18n";
import { guard } from "~/shared/lib/guards";
import { createLogger } from "~/shared/lib/logger";
import { createMessageId, normalizeMessageId } from "~/shared/lib/message-id.lib";
import type { MessageId } from "~/shared/lib/message-id.lib";
import { messageBodyToUnsanitizedDisplayHtml } from "~/shared/lib/message-markdown-display.lib";
import { mockMessageToRawMessage } from "~/shared/lib/message-mock-to-raw.lib";
import {
  MESSENGER_STREAM_ANCHOR_NUM_BEFORE,
  MESSENGER_STREAM_CHAT_NUM_AFTER,
} from "~/shared/lib/messenger-message-window.lib";
import type { MessengerMessagesNarrowClause } from "~/shared/lib/messenger-topic-narrow.lib";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import { numericUserIdOrNull, userIdStorageKey, type UserId } from "~/shared/lib/user-id.lib";
import { getMessengerWorkspaceApiBaseForCurrentInstance, messengerApi } from "./client";
import {
  fetchMeMessageById,
  fetchMyMessagesPage,
  meMessageToMockMessage,
  parseMeMessage,
} from "./messenger-me-messages";
import { rawMessageToMockMessage } from "./messenger-message-map.lib";
import { postWorkspaceSendMessage } from "./messenger-message-send.internal";
import { ensureMessengerApiReady } from "./messenger-pipeline.internal";
import {
  validateMessageIds,
  validateMessagesApiAnchor,
  validateNonNegativeInteger,
} from "./messenger-validation.internal";
import type {
  ActivityFilter,
  ActivityMessagesPageResult,
  CreateSavedSnippetParams,
  MessengerMeMessage,
  MockMessage,
  Reaction,
  MessagesPageResult,
  SavedSnippet,
  SendMessageParams,
  WorkspaceRawMessage,
} from "./messenger.types";

const log = createLogger("api:messenger-messages");

const ACTIVITY_NATIVE_MAX_PAGES = 100;

function workspaceMessageResponseToMockMessage(data: unknown): MockMessage | null {
  const envelope = data != null && typeof data === "object" ? data : null;
  const nestedMessage = envelope != null && "message" in envelope ? envelope.message : undefined;
  const row = parseMeMessage(data) ?? parseMeMessage(nestedMessage);
  return row == null ? null : meMessageToMockMessage(row);
}

/** Loads the latest messages without a narrow (default 1000). */
export async function fetchRecentMessages(numBefore = 1000): Promise<WorkspaceRawMessage[]> {
  const safeNumBefore = validateNonNegativeInteger(numBefore, "fetchRecentMessages.numBefore");
  if (safeNumBefore === 0) return [];
  try {
    const page = await fetchMyMessagesPage({
      limit: safeNumBefore,
      sortKey: "created_at",
      sortDir: "desc",
    });
    return [...page.messages].reverse().map(nativeMessageToRawMessage);
  } catch (error) {
    log.warn("Recent messages fetch failed", { error: String(error) });
    return [];
  }
}

/** Deep backfill: older chat-list messages before anchor. */
export async function fetchMessagesBeforeAnchor(
  anchorMessageId: MessageId,
  numBefore = 5000,
): Promise<WorkspaceRawMessage[]> {
  guard.messageId(anchorMessageId, "fetchMessagesBeforeAnchor.anchorMessageId");
  const safeNumBefore = validateNonNegativeInteger(
    numBefore,
    "fetchMessagesBeforeAnchor.numBefore",
  );
  if (safeNumBefore === 0) return [];
  try {
    const page = await fetchMyMessagesPage({
      limit: safeNumBefore,
      marker: anchorMessageId,
      sortKey: "created_at",
      sortDir: "desc",
    });
    return [...page.messages].reverse().map(nativeMessageToRawMessage);
  } catch (error) {
    log.warn("Messages before anchor fetch failed", { error: String(error) });
    return [];
  }
}

/** Loads newer chat-list messages after anchor (post-reconnect catch-up). */
export async function fetchMessagesAfterAnchor(
  anchorMessageId: MessageId,
  numAfter = 5000,
): Promise<WorkspaceRawMessage[]> {
  guard.messageId(anchorMessageId, "fetchMessagesAfterAnchor.anchorMessageId");
  const safeNumAfter = validateNonNegativeInteger(numAfter, "fetchMessagesAfterAnchor.numAfter");
  if (safeNumAfter === 0) return [];
  try {
    const page = await fetchMyMessagesPage({
      limit: safeNumAfter,
      marker: anchorMessageId,
      sortKey: "created_at",
      sortDir: "asc",
    });
    return page.messages.map(nativeMessageToRawMessage);
  } catch (error) {
    log.warn("Messages after anchor fetch failed", { error: String(error) });
    return [];
  }
}

/** Activity section narrows: starred, mentions, and reactions. */
export async function fetchActivityMessages(
  filter: ActivityFilter,
  _currentUserId?: UserId | null,
  anchor: MessageId = "newest",
  numBefore = 200,
  options?: { signal?: AbortSignal },
): Promise<WorkspaceRawMessage[]> {
  const page = await fetchActivityMessagesPage(filter, _currentUserId, anchor, numBefore, options);
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
  const validatedNumBefore = validateNonNegativeInteger(numBefore, "numBefore");
  if (validatedNumBefore === 0) {
    return { messages: [], foundOldest: normalizedAnchor === "newest" };
  }
  if (options?.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  try {
    return await fetchActivityMessagesPageViaNative({
      filter,
      currentUserId: currentUserId ?? null,
      normalizedAnchor,
      numBefore: validatedNumBefore,
      signal: options?.signal,
    });
  } catch (error) {
    if (isAbortError(error) || options?.signal?.aborted) {
      throw error;
    }
    log.warn("Activity messages fetch failed", { filter, error: String(error) });
    throw error instanceof Error ? error : new Error(t("app.networkError"));
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasPositiveReactionCounts(message: MessengerMeMessage): boolean {
  return Object.values(message.reactions ?? {}).some(
    (count) => Number.isFinite(count) && count > 0,
  );
}

function nativeMessageMentionsCurrentUser(
  message: MessengerMeMessage,
  currentUserId: UserId | null,
): boolean {
  if (message.mentioned === true) {
    return true;
  }
  if (currentUserId == null) {
    return false;
  }
  const needle = userIdStorageKey(currentUserId);
  if (needle.length === 0) {
    return false;
  }
  const mentionPattern = new RegExp(`\\]\\(urn:user:${escapeRegExp(needle)}\\)`, "i");
  return mentionPattern.test(message.payload.content);
}

function nativeMessageMatchesActivityFilter(
  message: MessengerMeMessage,
  filter: ActivityFilter,
  currentUserId: UserId | null,
): boolean {
  if (filter === "starred") {
    return message.starred;
  }
  if (filter === "mentions") {
    return nativeMessageMentionsCurrentUser(message, currentUserId);
  }
  return message.is_own && hasPositiveReactionCounts(message);
}

function nativeMessageToRawMessage(message: MessengerMeMessage): WorkspaceRawMessage {
  return mockMessageToRawMessage(meMessageToMockMessage(message));
}

async function fetchActivityMessagesPageViaNative(args: {
  filter: ActivityFilter;
  currentUserId: UserId | null;
  normalizedAnchor: MessageId;
  numBefore: number;
  signal?: AbortSignal;
}): Promise<ActivityMessagesPageResult> {
  const collectedNewestFirst: WorkspaceRawMessage[] = [];
  const seenMarkers = new Set<string>();
  let marker = args.normalizedAnchor === "newest" ? null : args.normalizedAnchor;
  let foundOldest = false;

  for (let pageIndex = 0; pageIndex < ACTIVITY_NATIVE_MAX_PAGES; pageIndex += 1) {
    if (args.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const page = await fetchMyMessagesPage({
      limit: args.numBefore,
      marker,
      sortKey: "created_at",
      sortDir: "desc",
      ...(args.filter === "starred" ? { starred: true } : {}),
      signal: args.signal,
    });
    if (args.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const matchingMessages = page.messages
      .filter((message) =>
        nativeMessageMatchesActivityFilter(message, args.filter, args.currentUserId),
      )
      .map(nativeMessageToRawMessage);
    collectedNewestFirst.push(...matchingMessages);

    const nextMarker = page.nextMarker;
    if (nextMarker == null || page.messages.length === 0 || nextMarker === marker) {
      foundOldest = true;
      break;
    }
    if (collectedNewestFirst.length >= args.numBefore) {
      break;
    }
    if (seenMarkers.has(nextMarker)) {
      foundOldest = true;
      break;
    }
    seenMarkers.add(nextMarker);
    marker = nextMarker;
  }

  return {
    messages: collectedNewestFirst.slice(0, args.numBefore).reverse(),
    foundOldest,
  };
}

export { rawMessageToMockMessage };

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
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
  const narrow: MessengerMessagesNarrowClause[] = [];
  if (normalizedStream) narrow.push({ operator: "stream", operand: normalizedStream });
  if (normalizedTopic !== undefined) {
    narrow.push({ operator: "topic", operand: normalizedTopic });
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

interface NativeMessagesNarrowQuery {
  streamUuid?: string;
  topicUuid?: string;
  starred?: boolean;
  unread?: boolean;
  search?: string;
  unsupported: boolean;
}

function readUuidOperand(value: MessengerMessagesNarrowClause["operand"]): string | undefined {
  return typeof value === "string" ? (normalizeMessageId(value) ?? undefined) : undefined;
}

function readStringOperand(value: MessengerMessagesNarrowClause["operand"]): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function applyNativeMessagesNarrowClause(
  query: NativeMessagesNarrowQuery,
  clause: MessengerMessagesNarrowClause,
): void {
  if (clause.negated === true) {
    query.unsupported = true;
    return;
  }

  if (clause.operator === "stream" || clause.operator === "topic") {
    const uuid = readUuidOperand(clause.operand);
    if (uuid == null) {
      query.unsupported = true;
      return;
    }
    if (clause.operator === "stream") {
      query.streamUuid = uuid;
    } else {
      query.topicUuid = uuid;
    }
    return;
  }

  if (clause.operator === "search") {
    query.search = readStringOperand(clause.operand);
    return;
  }

  if (clause.operator === "is" && clause.operand === "starred") {
    query.starred = true;
    return;
  }

  if (clause.operator === "is" && clause.operand === "unread") {
    query.unread = true;
    return;
  }

  query.unsupported = true;
}

function resolveNativeMessagesNarrow(
  narrow: readonly MessengerMessagesNarrowClause[],
): NativeMessagesNarrowQuery {
  const query: NativeMessagesNarrowQuery = { unsupported: false };
  for (const clause of narrow) {
    applyNativeMessagesNarrowClause(query, clause);
  }
  return query;
}

function nativeMessageToMockMessage(
  message: MessengerMeMessage,
  applyMarkdown: boolean,
): MockMessage {
  const mock = meMessageToMockMessage(message);
  if (!applyMarkdown) {
    return mock;
  }
  return {
    ...mock,
    content: messageBodyToUnsanitizedDisplayHtml(mock.content, { treatAsMarkdown: true }),
    markdown_source: mock.markdown_source ?? message.payload.content,
  };
}

function nativeMessageMatchesQuery(
  message: MessengerMeMessage,
  query: NativeMessagesNarrowQuery,
): boolean {
  if (query.unread === true && message.read) {
    return false;
  }
  if (query.search != null) {
    return message.payload.content.toLowerCase().includes(query.search.toLowerCase());
  }
  return true;
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
  if (options?.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  const nativeQuery = resolveNativeMessagesNarrow(narrow);
  if (nativeQuery.unsupported) {
    return { messages: [], foundOldest: true, foundNewest: validatedAnchor === "newest" };
  }
  const limit = validatedNumBefore + validatedNumAfter;
  if (limit === 0) {
    return { messages: [], foundOldest: false, foundNewest: validatedAnchor === "newest" };
  }
  const sortDir =
    validatedAnchor !== "newest" && validatedNumAfter > validatedNumBefore ? "asc" : "desc";
  try {
    const page = await fetchMyMessagesPage({
      limit,
      marker: validatedAnchor === "newest" ? null : validatedAnchor,
      sortKey: "created_at",
      sortDir,
      ...(nativeQuery.streamUuid != null ? { streamUuid: nativeQuery.streamUuid } : {}),
      ...(nativeQuery.topicUuid != null ? { topicUuid: nativeQuery.topicUuid } : {}),
      ...(nativeQuery.starred != null ? { starred: nativeQuery.starred } : {}),
      signal: options?.signal,
    });
    const rows = (sortDir === "desc" ? [...page.messages].reverse() : page.messages)
      .filter((message) => nativeMessageMatchesQuery(message, nativeQuery))
      .map((message) => nativeMessageToMockMessage(message, applyMarkdown));
    return {
      messages: rows,
      foundOldest: sortDir === "desc" ? page.nextMarker == null : false,
      foundNewest: sortDir === "asc" ? page.nextMarker == null : validatedAnchor === "newest",
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

/** Loads one page of all messages (no narrow) via the native marker API. */
export async function fetchAllMessagesPage(
  anchor: MessageId = "newest",
  numBefore = 100,
  options?: { applyMarkdown?: boolean; signal?: AbortSignal },
): Promise<MessagesPageResult> {
  const validatedAnchor = validateMessagesApiAnchor(anchor, "fetchAllMessagesPage");
  const validatedNumBefore = validateNonNegativeInteger(numBefore, "numBefore");
  if (validatedAnchor === "oldest" || validatedAnchor === "first_unread") {
    throw new Error("fetchAllMessagesPage only supports newest or message uuid anchors");
  }
  if (options?.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  if (validatedNumBefore === 0) {
    return {
      messages: [],
      foundOldest: false,
      foundNewest: validatedAnchor === "newest",
    };
  }
  try {
    const page = await fetchMyMessagesPage({
      limit: validatedNumBefore,
      marker: validatedAnchor === "newest" ? null : validatedAnchor,
      sortKey: "created_at",
      sortDir: "desc",
      signal: options?.signal,
    });
    return {
      messages: [...page.messages].reverse().map((message) => meMessageToMockMessage(message)),
      foundOldest: page.nextMarker == null,
      foundNewest: validatedAnchor === "newest",
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

/** Loads 1:1 DM messages; pass the peer `userId`. */
export async function fetchDmMessages(
  userIds: UserId | UserId[],
  options?: { signal?: AbortSignal },
): Promise<MockMessage[]> {
  const rawIds = Array.isArray(userIds) ? userIds : [userIds];
  if (rawIds.length === 0) return [];
  rawIds.forEach((userId, index) => {
    guard.userIdentity(userId, `fetchDmMessages.userIds[${index}]`);
  });
  if (options?.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  await Promise.resolve();
  return [];
}

/** Fetches specific messages by id through the native `/messages/<uuid>` endpoint. */
export async function fetchMessagesByIds(messageIds: MessageId[]): Promise<WorkspaceRawMessage[]> {
  log.info("fetchMessagesByIds: called", { inputCount: messageIds.length });

  const uniqueIds = [...new Set(messageIds.map(normalizeMessageId).filter((id) => id != null))];
  if (uniqueIds.length === 0) {
    log.info("fetchMessagesByIds: no valid ids after filter", { inputCount: messageIds.length });
    return [];
  }

  const validatedIds = validateMessageIds(uniqueIds, "fetchMessagesByIds");
  const rows = await Promise.all(validatedIds.map((messageId) => fetchMeMessageById(messageId)));
  const collected = rows
    .filter((message): message is MessengerMeMessage => message != null)
    .map(nativeMessageToRawMessage);
  log.info("fetchMessagesByIds: done", {
    requestedCount: validatedIds.length,
    fetchedCount: collected.length,
  });

  return collected;
}

/** Loads one message by id; returns null on error or non-ok response. */
export async function fetchMessageById(messageId: MessageId): Promise<MockMessage | null> {
  guard.messageId(messageId, "fetchMessageById");
  const res = await messengerApi.getWithBase(
    getMessengerWorkspaceApiBaseForCurrentInstance(),
    `/messages/${messageId}`,
  );
  if (!res?.ok) {
    return null;
  }
  return workspaceMessageResponseToMockMessage(res.data);
}

/** Server-rendered HTML for one message (includes `.message_embed` when link previews are enabled). */
export async function fetchMessageRenderedHtmlById(
  messageId: MessageId,
  signal?: AbortSignal,
): Promise<string | null> {
  guard.messageId(messageId, "fetchMessageRenderedHtmlById");
  const message = await fetchMeMessageById(messageId, signal);
  if (message == null) {
    return null;
  }
  const html = messageBodyToUnsanitizedDisplayHtml(message.payload.content, {
    treatAsMarkdown: true,
  });
  const trimmed = html.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function fetchSavedSnippets(): Promise<SavedSnippet[]> {
  return Promise.resolve([]);
}

export function createSavedSnippet(params: CreateSavedSnippetParams): Promise<number> {
  guard.nonEmpty(params.title.trim(), "createSavedSnippet.title");
  guard.nonEmpty(params.content.trim(), "createSavedSnippet.content");
  return Promise.reject(new Error("Saved snippets are unsupported by the current backend"));
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
    ...(result.provider !== undefined ? { provider: result.provider } : {}),
    ...(result.delivery !== undefined ? { delivery: result.delivery } : {}),
  };
  if (streamName.length > 0) {
    message.display_recipient = streamName;
    message.channel = streamName;
  }
  return message;
}

/** Renders markdown locally for composer preview. */
export function renderMessageContent(content: string): Promise<string> {
  const normalizedContent = guard.nonEmpty(content, "renderMessageContent.content");
  return Promise.resolve(
    messageBodyToUnsanitizedDisplayHtml(normalizedContent, { treatAsMarkdown: true }),
  );
}

export async function updateMessage(
  messageId: MessageId,
  params: { content: string },
): Promise<MockMessage | null> {
  guard.messageId(messageId, "updateMessage");
  const content = guard.nonEmpty(params.content, "updateMessage.content");
  const res = await messengerApi.putJsonWithBase(
    getMessengerWorkspaceApiBaseForCurrentInstance(),
    `/messages/${messageId}`,
    {
      payload: {
        kind: "markdown",
        content,
      },
    },
  );
  if (!res.ok) {
    const data = res.data as { msg?: string };
    throw new Error(data.msg ?? t("app.errorStatus", { status: String(res.status) }));
  }
  return workspaceMessageResponseToMockMessage(res.data);
}

export async function deleteMessage(messageId: MessageId): Promise<void> {
  guard.messageId(messageId, "deleteMessage");
  const res = await messengerApi.deleteWithBase(
    getMessengerWorkspaceApiBaseForCurrentInstance(),
    `/messages/${messageId}`,
  );
  if (!res.ok) {
    const data = res.data as { msg?: string };
    throw new Error(data.msg ?? t("app.errorStatus", { status: String(res.status) }));
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function optionalReactionString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function parseMessageReaction(data: unknown): Reaction {
  if (!isRecord(data)) {
    throw new Error("Invalid message reaction response");
  }
  const uuid = guard.nonEmpty(data.uuid, "messageReaction.uuid");
  const userUuid = guard.nonEmpty(data.user_uuid, "messageReaction.user_uuid");
  const messageUuid = guard.messageId(data.message_uuid, "messageReaction.message_uuid");
  const emojiName = guard.nonEmpty(data.emoji_name, "messageReaction.emoji_name");
  const reaction: Reaction = {
    uuid,
    user_uuid: userUuid,
    message_uuid: messageUuid,
    emoji_name: emojiName,
  };
  const projectId = optionalReactionString(data.project_id);
  if (projectId != null) {
    reaction.project_id = projectId;
  }
  const createdAt = optionalReactionString(data.created_at);
  if (createdAt != null) {
    reaction.created_at = createdAt;
  }
  const updatedAt = optionalReactionString(data.updated_at);
  if (updatedAt != null) {
    reaction.updated_at = updatedAt;
  }
  return reaction;
}

function parseMessageReactionList(data: unknown): Reaction[] {
  if (!Array.isArray(data)) {
    throw new Error("Invalid message reactions response");
  }
  return data.map(parseMessageReaction);
}

export interface FetchMessageReactionsOptions {
  signal?: AbortSignal;
  userUuid?: string;
}

export async function fetchMessageReactions(
  messageId: MessageId,
  options: FetchMessageReactionsOptions = {},
): Promise<Reaction[]> {
  const normalizedMessageId = guard.messageId(messageId, "fetchMessageReactions.messageId");
  const query: Record<string, string> = { message_uuid: normalizedMessageId };
  if (options.userUuid != null) {
    query.user_uuid = guard.nonEmpty(options.userUuid, "fetchMessageReactions.userUuid");
  }
  ensureMessengerApiReady();
  const res = await messengerApi.getWithBase(
    getMessengerWorkspaceApiBaseForCurrentInstance(),
    "/message_reactions/",
    query,
    options.signal,
  );
  if (!res.ok) {
    const data = res.data as { msg?: string };
    throw new Error(data.msg ?? t("app.errorStatus", { status: String(res.status) }));
  }
  return parseMessageReactionList(res.data);
}

export interface AddReactionOptions {
  currentUserUuid?: string;
}

export async function addReaction(
  messageId: MessageId,
  emojiName: string,
  options: AddReactionOptions = {},
): Promise<{ reaction: Reaction; created: boolean }> {
  const normalizedMessageId = guard.messageId(messageId, "addReaction.messageId");
  const normalizedEmojiName = guard.nonEmpty(emojiName, "addReaction.emojiName");
  ensureMessengerApiReady();
  const res = await messengerApi.postJsonWithBase(
    getMessengerWorkspaceApiBaseForCurrentInstance(),
    "/message_reactions/",
    {
      message_uuid: normalizedMessageId,
      emoji_name: normalizedEmojiName,
    },
  );
  if (res.ok) {
    return { reaction: parseMessageReaction(res.data), created: true };
  }
  if (res.status === 409) {
    const reactions = await fetchMessageReactions(normalizedMessageId, {
      ...(options.currentUserUuid != null ? { userUuid: options.currentUserUuid } : {}),
    });
    const existing = reactions.find((reaction) => reaction.emoji_name === normalizedEmojiName);
    if (existing != null) {
      return { reaction: existing, created: false };
    }
  }
  const data = res.data as { msg?: string };
  throw new Error(data.msg ?? t("app.errorStatus", { status: String(res.status) }));
}

export async function removeReaction(reactionUuid: string): Promise<void> {
  const normalizedReactionUuid = guard.nonEmpty(reactionUuid, "removeReaction.reactionUuid");
  ensureMessengerApiReady();
  const res = await messengerApi.deleteWithBase(
    getMessengerWorkspaceApiBaseForCurrentInstance(),
    `/message_reactions/${normalizedReactionUuid}`,
  );
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
