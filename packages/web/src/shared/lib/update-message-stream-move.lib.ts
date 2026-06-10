import type { ZulipEvent } from "~/shared/api/zulip.types";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import { resolveTopicMoveTargetMessageIds } from "~/shared/lib/update-message-topic-move.lib";

export interface UpdateMessageStreamMovePayload {
  sourceStreamId: number;
  targetStreamId: number;
  oldTopic: string;
  newTopic: string;
  messageIds?: number[];
  anchorMessageId?: number;
}

function parsePositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function parsePositiveIntegerArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const ids = value.filter(
    (item): item is number => typeof item === "number" && Number.isInteger(item) && item > 0,
  );
  return ids.length > 0 ? Array.from(new Set(ids)) : null;
}

/** Parses cross-channel topic move from update_message when new_stream_id is present. */
export function extractStreamMoveFromUpdateEvent(
  event: ZulipEvent,
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
  const messageIds = parsePositiveIntegerArray(event.message_ids) ?? undefined;
  const anchorMessageId = parsePositiveInteger(event.message_id) ?? undefined;
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
