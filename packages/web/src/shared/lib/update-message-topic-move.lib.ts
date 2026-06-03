import type { ZulipEvent } from "~/shared/api/zulip.types";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";

export interface UpdateMessageTopicMovePayload {
  streamId: number;
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

export function resolveTopicMoveTargetMessageIds(options: {
  messageIds?: readonly number[];
  anchorMessageId?: number;
}): number[] {
  // Topic rename moves only explicit message_ids + anchor, not a whole-topic fallback.
  const targetIds = new Set<number>();
  const ids = parsePositiveIntegerArray(options.messageIds);
  if (ids != null) {
    for (const messageId of ids) {
      targetIds.add(messageId);
    }
  }
  const anchorMessageId = parsePositiveInteger(options.anchorMessageId);
  if (anchorMessageId != null) {
    targetIds.add(anchorMessageId);
  }
  return Array.from(targetIds);
}

export function extractTopicMoveFromUpdateEvent(
  event: ZulipEvent,
): UpdateMessageTopicMovePayload | null {
  if (event.type !== "update_message") return null;

  const streamId = parsePositiveInteger(event.stream_id);
  const oldTopicRaw = typeof event.orig_subject === "string" ? event.orig_subject : null;
  const newTopicRaw = typeof event.subject === "string" ? event.subject : null;
  if (streamId == null || oldTopicRaw == null || newTopicRaw == null) return null;

  const oldTopic = normalizeTopicForIdentity(oldTopicRaw);
  const newTopic = normalizeTopicForIdentity(newTopicRaw);
  if (oldTopic === newTopic) return null;
  const messageIds = parsePositiveIntegerArray(event.message_ids) ?? undefined;
  const anchorMessageId = parsePositiveInteger(event.message_id) ?? undefined;
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
