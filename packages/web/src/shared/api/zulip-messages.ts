/**
 * Zulip messages: fetch, send, edit, reactions, flags, snippets, activity narrow.
 */
import { t } from "~/i18n/i18n";
import { guard } from "~/shared/lib/guards";
import {
  ZULIP_DM_CHAT_NUM_AFTER,
  ZULIP_DM_CHAT_NUM_BEFORE,
  ZULIP_STREAM_CHAT_NUM_AFTER,
  ZULIP_STREAM_CHAT_NUM_BEFORE,
} from "~/shared/lib/zulip-message-window.lib";
import { getClient, type ZulipClient } from "./zulip-client.internal";
import { mockMessageFromGetMessageApiData, rawMessageToMockMessage } from "./zulip-message-map.lib";
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
}

interface NarrowEntry {
  negated?: boolean;
  operator: string;
  operand: string | number;
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

async function fetchMessageWindow(options: MessageWindowOptions): Promise<ZulipRawMessage[]> {
  const { anchor, numBefore, numAfter, includeAnchor } = options;
  const res = await zulipPipelineGet("/messages", {
    anchor: String(anchor),
    ...(includeAnchor == null ? {} : { include_anchor: includeAnchor ? "true" : "false" }),
    num_before: String(numBefore),
    num_after: String(numAfter),
    client_gravatar: "true",
    allow_empty_topic_name: "true",
    apply_markdown: "false",
  });
  if (!res?.ok) return [];
  const data = res.data as { result?: string; messages?: ZulipRawMessage[] };
  if (!data || data.result === "error") return [];
  return data.messages ?? [];
}

/** Fetches the latest 1000 messages (no narrow) to build the sidebar chat/channel list. */
export async function fetchRecentMessages(): Promise<ZulipRawMessage[]> {
  return fetchMessageWindow({
    anchor: "newest",
    numBefore: 1000,
    numAfter: 0,
  });
}

/** Fetches older chat-list messages before anchor (used for deep bootstrap backfill). */
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
  });
}

/** Fetches newer chat-list messages after anchor (used after reconnect). */
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
  });
}

/** Fetches messages for the "My Activity" section (starred, mentions, reactions). */
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

function mapZulipMessage(m: RawMessageToMockInput): MockMessage {
  return rawMessageToMockMessage(m);
}

export async function fetchMessages(
  stream?: string,
  topic?: string,
  q?: string,
): Promise<MockMessage[]> {
  const normalizedStream =
    stream == null ? undefined : guard.nonEmpty(stream, "fetchMessages.stream");
  const normalizedTopic = topic == null ? undefined : guard.nonEmpty(topic, "fetchMessages.topic");
  if (normalizedTopic !== undefined && normalizedStream === undefined) {
    throw new Error("fetchMessages.stream is required when topic is provided");
  }
  const client = await getClient();
  const narrow: { operator: string; operand: string }[] = [];
  if (normalizedStream) narrow.push({ operator: "stream", operand: normalizedStream });
  if (normalizedTopic) narrow.push({ operator: "topic", operand: normalizedTopic });
  if (q?.trim()) narrow.push({ operator: "search", operand: q.trim() });
  try {
    const data = (await client.messages.retrieve({
      narrow: narrow.length ? narrow : undefined,
      anchor: "newest",
      num_before: ZULIP_STREAM_CHAT_NUM_BEFORE,
      num_after: ZULIP_STREAM_CHAT_NUM_AFTER,
      apply_markdown: false,
    })) as { result?: string; messages?: RawMessageToMockInput[] };
    if (data.result === "error") return [];
    const list = data.messages ?? [];
    return list.map(mapZulipMessage);
  } catch {
    return [];
  }
}

/** Generic narrow-based message fetch with configurable anchor and counts. */
export async function fetchMessagesWithNarrow(
  narrow: { operator: string; operand: string | number | number[] }[],
  anchor: string | number = "newest",
  numBefore = ZULIP_STREAM_CHAT_NUM_BEFORE,
  numAfter = ZULIP_STREAM_CHAT_NUM_AFTER,
): Promise<MockMessage[]> {
  const page = await fetchMessagesWithNarrowPage(narrow, anchor, numBefore, numAfter);
  return page.messages;
}

/** Generic narrow-based message fetch with pagination metadata. */
export async function fetchMessagesWithNarrowPage(
  narrow: { operator: string; operand: string | number | number[] }[],
  anchor: string | number = "newest",
  numBefore = ZULIP_STREAM_CHAT_NUM_BEFORE,
  numAfter = ZULIP_STREAM_CHAT_NUM_AFTER,
): Promise<MessagesPageResult> {
  const validatedAnchor = validateMessagesApiAnchor(anchor, "fetchMessagesWithNarrowPage");
  const validatedNumBefore = validateNonNegativeInteger(numBefore, "numBefore");
  const validatedNumAfter = validateNonNegativeInteger(numAfter, "numAfter");
  const client = await getClient();
  try {
    const data = (await client.messages.retrieve({
      narrow: narrow.length > 0 ? narrow : undefined,
      anchor: validatedAnchor,
      num_before: validatedNumBefore,
      num_after: validatedNumAfter,
      apply_markdown: false,
    })) as {
      result?: string;
      messages?: RawMessageToMockInput[];
      found_oldest?: boolean;
      foundOldest?: boolean;
      found_newest?: boolean;
      foundNewest?: boolean;
    };
    if (data.result === "error") return { messages: [], foundOldest: false, foundNewest: false };
    return {
      messages: (data.messages ?? []).map(mapZulipMessage),
      foundOldest: data.found_oldest ?? data.foundOldest ?? false,
      foundNewest: data.found_newest ?? data.foundNewest ?? false,
    };
  } catch {
    return { messages: [], foundOldest: false, foundNewest: false };
  }
}

/** Fetches a page of all messages (no narrow) via API pipeline. */
export async function fetchAllMessagesPage(
  anchor: string | number = "newest",
  numBefore = 100,
): Promise<MessagesPageResult> {
  const validatedAnchor = validateMessagesApiAnchor(anchor, "fetchAllMessagesPage");
  const validatedNumBefore = validateNonNegativeInteger(numBefore, "numBefore");
  const res = await zulipPipelineGet("/messages", {
    anchor: String(validatedAnchor),
    num_before: String(validatedNumBefore),
    num_after: "0",
    narrow: "[]",
    allow_empty_topic_name: "true",
    client_gravatar: "true",
    apply_markdown: "false",
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

/** Fetches DM messages (1-on-1 or group). Pass the other user's [userId] for 1-on-1. */
export async function fetchDmMessages(userIds: number | number[]): Promise<MockMessage[]> {
  const client = await getClient();
  const rawIds = Array.isArray(userIds) ? userIds : [userIds];
  if (rawIds.length === 0) return [];
  const ids = rawIds.map((userId, index) =>
    guard.userId(userId, `fetchDmMessages.userIds[${index}]`),
  );
  if (ids.some((id) => id >= GROUP_DM_ID_OFFSET)) return [];
  const params = {
    narrow: [{ negated: false, operator: "dm", operand: ids }] as DmNarrow[],
    anchor: "newest",
    num_before: ZULIP_DM_CHAT_NUM_BEFORE,
    num_after: ZULIP_DM_CHAT_NUM_AFTER,
    client_gravatar: true,
    allow_empty_topic_name: true,
    apply_markdown: false,
  };
  try {
    const data = await client.messages.retrieve(
      params as Parameters<ZulipClient["messages"]["retrieve"]>[0],
    );
    const raw = data as { result?: string; messages?: RawMessageToMockInput[] };
    if (raw.result === "error") return [];
    const list = raw.messages ?? [];
    return list.map(mapZulipMessage);
  } catch {
    return [];
  }
}

/** Fetches a single message by id. Returns null on non-ok/error response. */
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

/** Fetches saved snippets for the current user (GET /api/v1/saved_snippets). */
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
    const dateCreated =
      typeof row.date_created === "number"
        ? row.date_created
        : typeof row.dateCreated === "number"
          ? row.dateCreated
          : 0;
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

/** Creates a saved snippet (POST /api/v1/saved_snippets). */
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
  const client = await getClient();

  if (isPrivate) {
    const recipients = params.to ?? [];
    for (const recipientId of recipients) {
      guard.userId(recipientId, "sendMessage.to");
    }
    const result = await client.messages.send({
      type: "private",
      to: recipients,
      content,
    });
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
  const subject = params.subject ?? "general";
  const result = await client.messages.send({
    type: "stream",
    to: stream,
    topic: subject,
    content,
  });
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

/** Renders markdown content via Zulip for composer preview (POST /api/v1/messages/render). */
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

/** Updates a message's content (PATCH /api/v1/messages/{message_id}). */
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

/** Deletes a message (DELETE /api/v1/messages/{message_id}). */
export async function deleteMessage(messageId: number): Promise<void> {
  guard.messageId(messageId, "deleteMessage");
  const res = await zulipPipelineDelete(`messages/${messageId}`);
  if (!res.ok) {
    const data = res.data as { msg?: string };
    throw new Error(data.msg ?? t("app.errorStatus", { status: String(res.status) }));
  }
}

/** Adds a reaction to a message (POST /api/v1/messages/{message_id}/reactions). */
export async function addReaction(
  messageId: number,
  emojiName: string,
  reactionType: "unicode_emoji" | "realm_emoji" | "zulip_extra_emoji" = "unicode_emoji",
): Promise<void> {
  guard.messageId(messageId, "addReaction");
  const normalizedEmojiName = guard.nonEmpty(emojiName, "addReaction.emojiName");
  const body: Record<string, string> = {
    emoji_name: normalizedEmojiName,
    reaction_type: reactionType,
  };
  const res = await zulipPipelinePost(`messages/${messageId}/reactions`, body);
  if (!res.ok) {
    const data = res.data as { msg?: string; code?: string };
    if (data.code === "REACTION_ALREADY_EXISTS") return;
    throw new Error(data.msg ?? t("app.errorStatus", { status: String(res.status) }));
  }
}

/** Removes a reaction from a message (DELETE /api/v1/messages/{message_id}/reactions). */
export async function removeReaction(
  messageId: number,
  emojiName: string,
  options?: { emojiCode?: string; reactionType?: string },
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

/** Adds or removes a flag on messages (POST /api/v1/messages/flags). */
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

/** Adds a flag to messages (e.g. "starred"). */
export async function addMessageFlag(messageIds: number[], flag: string): Promise<void> {
  await updateMessageFlags(messageIds, "add", flag);
}

/** Removes a flag from messages (e.g. unstar). */
export async function removeMessageFlag(messageIds: number[], flag: string): Promise<void> {
  await updateMessageFlags(messageIds, "remove", flag);
}
