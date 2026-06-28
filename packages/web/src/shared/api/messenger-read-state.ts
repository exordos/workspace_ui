/**
 * Workspace read-state and topic resolution.
 */
import { guard } from "~/shared/lib/guards";
import { createLogger } from "~/shared/lib/logger";
import { logScrollReadFlow } from "~/shared/lib/message-flow-debug.lib";
import { normalizeMessageId, type MessageId } from "~/shared/lib/message-id.lib";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import type { UserId } from "~/shared/lib/user-id.lib";
import { getMessengerWorkspaceApiBaseForCurrentInstance, messengerApi } from "./client";
import { toggleStreamTopicDone, updateStreamTopic } from "./messenger-streams";
import { validateMessageIds } from "./messenger-validation.internal";
import type { MessengerStreamTopic } from "./messenger.types";

const log = createLogger("messenger-read-state");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function logReadStateUnsupported(action: string): void {
  log.warn("read-state write target cannot be resolved", { action });
}

function readErrorMessage(data: unknown, status: number, fallback: string): string {
  if (data != null && typeof data === "object" && "msg" in data) {
    const msg = (data as { msg?: unknown }).msg;
    if (typeof msg === "string" && msg.trim().length > 0) {
      return msg;
    }
  }
  return `${fallback} (${status})`;
}

function normalizeOptionalUuid(value: string | undefined): string | null {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return UUID_RE.test(normalized) ? normalized : null;
}

async function postReadAction(path: string, action: string): Promise<boolean> {
  const res = await messengerApi.postJsonWithBase(
    getMessengerWorkspaceApiBaseForCurrentInstance(),
    path,
    {},
  );
  if (res.ok) {
    return true;
  }
  log.warn("read-state action failed", { action, status: res.status });
  return false;
}

function readConfirmedMessageId(data: unknown): MessageId | null {
  const candidate =
    data != null && typeof data === "object" && "message" in data
      ? (data as { message?: unknown }).message
      : data;
  if (candidate == null || typeof candidate !== "object") return null;
  const row = candidate as { id?: unknown; uuid?: unknown; read?: unknown };
  if (row.read !== true) return null;
  return normalizeMessageId(row.id) ?? normalizeMessageId(row.uuid);
}

/** Marks a direct-message stream as read when its Workspace stream UUID is known. */
export function markDmAsRead(userIds: UserId[], streamId?: string | null): Promise<boolean> {
  if (streamId == null || streamId.trim().length === 0) {
    if (userIds.length > 0) {
      logReadStateUnsupported("markDmAsRead");
    }
    return Promise.resolve(false);
  }
  return markStreamAsRead(streamId);
}

/** Marks all unread messages in a Workspace stream as read. */
export async function markStreamAsRead(streamId: string): Promise<boolean> {
  const streamUuid = guard.streamUuid(streamId, "markStreamAsRead.streamId");
  return postReadAction(`/streams/${streamUuid}/actions/read/invoke`, "markStreamAsRead");
}

/** Marks all unread messages in a Workspace topic as read. */
export function markTopicAsRead(
  streamId: string,
  topic: string,
  topicUuid?: string | null,
): Promise<boolean> {
  guard.streamUuid(streamId, "markTopicAsRead");
  const resolvedTopicUuid = normalizeOptionalUuid(topicUuid ?? topic);
  if (resolvedTopicUuid == null) {
    if (topic.trim().length > 0) {
      logReadStateUnsupported("markTopicAsRead");
    }
    return Promise.resolve(false);
  }
  return postReadAction(
    `/stream_topics/${resolvedTopicUuid}/actions/read/invoke`,
    "markTopicAsRead",
  );
}

/** Renames a stream topic through the server-owned topic entity. */
export async function renameStreamTopic(
  topicUuid: string,
  streamId: string,
  topic: string,
  newTopic: string,
): Promise<MessengerStreamTopic | null> {
  guard.streamUuid(topicUuid, "renameStreamTopic.topicUuid");
  guard.streamUuid(streamId, "renameStreamTopic.streamId");
  const normalizedTopic = normalizeTopicForIdentity(topic);
  const targetTopic = normalizeTopicForIdentity(newTopic.trim());
  if (targetTopic.length === 0) {
    return null;
  }
  if (targetTopic === normalizedTopic) {
    return null;
  }

  const result = await updateStreamTopic({ topicUuid, name: targetTopic });
  return result.ok ? result.topic : null;
}

/** Moves a stream topic entity to another channel. */
export async function moveStreamTopicToChannel(
  topicUuid: string,
  sourceStreamId: string,
  topic: string,
  targetStreamId: string,
  targetTopic: string,
): Promise<MessengerStreamTopic | null> {
  guard.streamUuid(topicUuid, "moveStreamTopicToChannel.topicUuid");
  guard.streamUuid(sourceStreamId, "moveStreamTopicToChannel.sourceStreamId");
  guard.streamUuid(targetStreamId, "moveStreamTopicToChannel.targetStreamId");
  const normalizedTopic = normalizeTopicForIdentity(topic);
  const normalizedTargetTopic = normalizeTopicForIdentity(targetTopic.trim());
  if (normalizedTargetTopic.length === 0) {
    return null;
  }
  if (sourceStreamId === targetStreamId) {
    return null;
  }

  const result = await updateStreamTopic({
    topicUuid,
    streamUuid: targetStreamId,
    ...(normalizedTargetTopic !== normalizedTopic ? { name: normalizedTargetTopic } : {}),
  });
  return result.ok ? result.topic : null;
}

/** Toggles the server-owned done state for a stream topic. */
export async function setTopicResolvedState(
  topicUuid: string,
  streamId: string,
  _topic: string,
  _resolved: boolean,
): Promise<MessengerStreamTopic | null> {
  guard.streamUuid(topicUuid, "setTopicResolvedState.topicUuid");
  guard.streamUuid(streamId, "setTopicResolvedState.streamId");

  const result = await toggleStreamTopicDone(topicUuid);
  return result.ok ? result.topic : null;
}

async function markTopicMessagesAsReadUpTo(messageId: MessageId): Promise<MessageId[]> {
  const res = await messengerApi.postJsonWithBase(
    getMessengerWorkspaceApiBaseForCurrentInstance(),
    `/messages/${messageId}/actions/read_up_to/invoke`,
    {},
  );
  if (!res.ok) {
    throw new Error(readErrorMessage(res.data, res.status, "Failed to mark messages as read"));
  }
  const confirmedMessageId = readConfirmedMessageId(res.data);
  return confirmedMessageId == null ? [] : [confirmedMessageId];
}

/** Marks unread messages up to the newest provided message through the Workspace topic action. */
export async function markMessagesAsRead(messageIds: MessageId[]): Promise<MessageId[]> {
  if (messageIds.length === 0) return [];
  const validatedMessageIds = validateMessageIds(messageIds, "markMessagesAsRead.messageIds");
  logScrollReadFlow("api:markMessagesAsRead", { count: validatedMessageIds.length });
  const lastMessageId = validatedMessageIds[validatedMessageIds.length - 1];
  if (lastMessageId == null) return [];
  return markTopicMessagesAsReadUpTo(lastMessageId);
}
