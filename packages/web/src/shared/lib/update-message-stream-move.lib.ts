import type { MessengerEvent } from "~/shared/api/messenger.types";
import { normalizeMessageId, type MessageId } from "~/shared/lib/message-id.lib";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import { resolveTopicMoveTargetMessageIds } from "~/shared/lib/update-message-topic-move.lib";

export interface UpdateMessageStreamMovePayload {
  sourceStreamId: number;
  targetStreamId: number;
  oldTopic: string;
  newTopic: string;
  messageIds?: MessageId[];
  anchorMessageId?: MessageId;
}

function parsePositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function parseMessageIdArray(value: unknown): MessageId[] | null {
  if (!Array.isArray(value)) return null;
  const ids = value.flatMap((item) => {
    const id = normalizeMessageId(item);
    return id == null ? [] : [id];
  });
  return ids.length > 0 ? Array.from(new Set(ids)) : null;
}

/** Parses cross-channel topic move from update_message when new_stream_id is present. */
export function extractStreamMoveFromUpdateEvent(
  event: MessengerEvent,
): UpdateMessageStreamMovePayload | null {
  if (event.type !== "update_message") return null;

  const sourceStreamId = parsePositiveInteger(event.stream_id);
  const targetStreamId = parsePositiveInteger(event.new_stream_id);
  if (sourceStreamId == null || targetStreamId == null || sourceStreamId === targetStreamId) {
    return null;
  }

  const oldTopicRaw = typeof event.orig_subject === "string" ? event.orig_subject : null;
  const newTopicRaw = typeof event.subject === "string" ? event.subject : null;
  if (oldTopicRaw == null || newTopicRaw == null) return null;

  const oldTopic = normalizeTopicForIdentity(oldTopicRaw);
  const newTopic = normalizeTopicForIdentity(newTopicRaw);
  const messageIds = parseMessageIdArray(event.message_ids) ?? undefined;
  const anchorMessageId = normalizeMessageId(event.message_id) ?? undefined;
  const targetMessageIds = resolveTopicMoveTargetMessageIds({ messageIds, anchorMessageId });
  if (targetMessageIds.length === 0) return null;

  return {
    sourceStreamId,
    targetStreamId,
    oldTopic,
    newTopic,
    messageIds,
    anchorMessageId,
  };
}
