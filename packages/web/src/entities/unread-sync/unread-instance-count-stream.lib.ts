import type {
  ComputeInstanceUnreadInput,
  UnreadStreamBadgeHolder,
} from "./unread-instance-count.types";

export interface UnreadStreamMutePredicates {
  isStreamMuted?: (streamId: number) => boolean;
  isEffectivelyMuted?: (streamId: number, topic: string) => boolean;
}

// Badge values can be missing or bad; counters should never go below zero.
export function toSafeUnreadCount(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return 0;
  if (value == null) return 0;
  return Math.max(0, Math.floor(value));
}

// Stream id is optional because some callers pass a compact sidebar row.
function resolveStreamId(stream: UnreadStreamBadgeHolder): number | null {
  const streamIdRaw = stream.stream_id;
  if (typeof streamIdRaw !== "number" || !Number.isInteger(streamIdRaw)) return null;
  return streamIdRaw;
}

// If topics are not loaded, use the stream badge unless the whole stream is muted.
function sumStreamBadgeWhenTopicsUnknown(
  stream: UnreadStreamBadgeHolder,
  streamId: number | null,
  predicates: UnreadStreamMutePredicates,
): number {
  if (streamId != null && predicates.isStreamMuted?.(streamId)) {
    return 0;
  }
  return toSafeUnreadCount(stream.badge);
}

// If topics are loaded, muted topics are skipped one by one.
function sumTopicBadgesForStream(
  stream: UnreadStreamBadgeHolder,
  streamId: number,
  predicates: UnreadStreamMutePredicates,
): number {
  const topics = stream.topics;
  if (!Array.isArray(topics) || topics.length === 0) {
    return 0;
  }

  let total = 0;
  for (const topic of topics) {
    if (topic == null) continue;
    const subject = typeof topic.subject === "string" ? topic.subject : "";
    if (subject.length === 0) {
      total += toSafeUnreadCount(topic.badge);
      continue;
    }
    if (predicates.isEffectivelyMuted?.(streamId, subject)) {
      continue;
    }
    total += toSafeUnreadCount(topic.badge);
  }
  return total;
}

// Stream unread for one org with stream/topic mute rules applied.
export function computeInstanceStreamUnreadCountWithMute(
  streams: ComputeInstanceUnreadInput["streams"],
  predicates: UnreadStreamMutePredicates,
): number {
  let total = 0;

  for (const stream of streams) {
    const streamId = resolveStreamId(stream);
    const topics = stream.topics;

    if (streamId == null || !Array.isArray(topics) || topics.length === 0) {
      total += sumStreamBadgeWhenTopicsUnknown(stream, streamId, predicates);
      continue;
    }

    if (predicates.isStreamMuted?.(streamId)) {
      continue;
    }

    total += sumTopicBadgesForStream(stream, streamId, predicates);
  }

  return total;
}
