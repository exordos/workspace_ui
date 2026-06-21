import type { MessengerEvent } from "~/shared/api/messenger.types";
import { normalizeMessageId } from "~/shared/lib/message-id.lib";
import type { MessageId } from "~/shared/lib/message-id.lib";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";

export interface UpdateMessageTopicMovePayload {
  streamId: string;
  oldTopic: string;
  newTopic: string;
  messageIds?: MessageId[];
  anchorMessageId?: MessageId;
}

function parseStreamUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function parseMessageIdArray(value: unknown): MessageId[] | null {
  if (!Array.isArray(value)) return null;
  const ids = value.map(normalizeMessageId).filter((id) => id != null);
  return ids.length > 0 ? Array.from(new Set(ids)) : null;
}

export function resolveTopicMoveTargetMessageIds(options: {
  messageIds?: readonly MessageId[];
  anchorMessageId?: MessageId;
}): MessageId[] {
  // Topic rename moves only explicit message_ids + anchor, not a whole-topic fallback.
  const targetIds = new Set<MessageId>();
  const ids = parseMessageIdArray(options.messageIds);
  if (ids != null) {
    for (const messageId of ids) {
      targetIds.add(messageId);
    }
  }
  const anchorMessageId = normalizeMessageId(options.anchorMessageId);
  if (anchorMessageId != null) {
    targetIds.add(anchorMessageId);
  }
  return Array.from(targetIds);
}

export function extractTopicMoveFromUpdateEvent(
  event: MessengerEvent,
): UpdateMessageTopicMovePayload | null {
  if (event.type !== "update_message") return null;

  const streamId = parseStreamUuid(event.stream_uuid);
  const oldTopicRaw = typeof event.orig_subject === "string" ? event.orig_subject : null;
  const newTopicRaw = typeof event.subject === "string" ? event.subject : null;
  if (streamId == null || oldTopicRaw == null || newTopicRaw == null) return null;

  const oldTopic = normalizeTopicForIdentity(oldTopicRaw);
  const newTopic = normalizeTopicForIdentity(newTopicRaw);
  if (oldTopic === newTopic) return null;
  const messageIds = parseMessageIdArray(event.message_ids) ?? undefined;
  const anchorMessageId = normalizeMessageId(event.message_id) ?? undefined;
  const targetMessageIds = resolveTopicMoveTargetMessageIds({ messageIds, anchorMessageId });
  if (targetMessageIds.length === 0) return null;

  return {
    streamId,
    oldTopic,
    newTopic,
    messageIds,
    anchorMessageId,
  };
}
