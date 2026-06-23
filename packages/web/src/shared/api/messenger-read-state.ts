/**
 * Workspace read-state and topic resolution.
 */
import { guard } from "~/shared/lib/guards";
import { createLogger } from "~/shared/lib/logger";
import { logScrollReadFlow } from "~/shared/lib/message-flow-debug.lib";
import type { MessageId } from "~/shared/lib/message-id.lib";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import type { UserId } from "~/shared/lib/user-id.lib";
import { toggleStreamTopicDone, updateStreamTopic } from "./messenger-streams";
import { validateMessageIds } from "./messenger-validation.internal";
import type { MessengerStreamTopic } from "./messenger.types";

const log = createLogger("messenger-read-state");

function logReadStateUnsupported(action: string): void {
  log.warn("read-state write is not available in the new backend yet", { action });
}

/** Bulk mark-read is disabled until the new backend exposes a read-state write API. */
export function markDmAsRead(userIds: UserId[]): Promise<boolean> {
  if (userIds.length === 0) return Promise.resolve(false);
  logReadStateUnsupported("markDmAsRead");
  return Promise.resolve(false);
}

/** Bulk mark-read is disabled until the new backend exposes a read-state write API. */
export function markStreamAsRead(streamId: string): Promise<boolean> {
  guard.streamUuid(streamId, "markStreamAsRead");
  logReadStateUnsupported("markStreamAsRead");
  return Promise.resolve(false);
}

/** Bulk mark-read is disabled until the new backend exposes a read-state write API. */
export function markTopicAsRead(streamId: string, topic: string): Promise<boolean> {
  guard.streamUuid(streamId, "markTopicAsRead");
  if (topic.trim().length === 0) return Promise.resolve(false);
  logReadStateUnsupported("markTopicAsRead");
  return Promise.resolve(false);
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
  topic: string,
  resolved: boolean,
): Promise<MessengerStreamTopic | null> {
  guard.streamUuid(topicUuid, "setTopicResolvedState.topicUuid");
  guard.streamUuid(streamId, "setTopicResolvedState.streamId");
  void topic;
  void resolved;

  const result = await toggleStreamTopicDone(topicUuid);
  return result.ok ? result.topic : null;
}

/** Marks messages as read. Disabled until the new backend exposes a read-state write API. */
export function markMessagesAsRead(messageIds: MessageId[]): Promise<void> {
  if (messageIds.length === 0) return Promise.resolve();
  const validatedMessageIds = validateMessageIds(messageIds, "markMessagesAsRead.messageIds");
  logScrollReadFlow("api:markMessagesAsRead", { count: validatedMessageIds.length });
  logReadStateUnsupported("markMessagesAsRead");
  return Promise.reject(new Error("Read-state write API is not available in the new backend"));
}
