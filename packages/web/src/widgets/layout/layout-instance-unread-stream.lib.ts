import type { LayoutComputeInstanceUnreadInput } from "./layout-instance-unread.types";

type LayoutTopicBadgeHolder = { subject?: string; badge?: number | null } | null | undefined;

interface LayoutStreamWithTopics {
  stream_id?: number | null;
  topics?: readonly LayoutTopicBadgeHolder[] | null;
}

export interface LayoutStreamUnreadMutePredicates {
  isStreamMuted?: (streamId: number) => boolean;
  isEffectivelyMuted?: (streamId: number, topic: string) => boolean;
}

function toSafeUnreadCount(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return 0;
  if (value == null) return 0;
  return Math.max(0, Math.floor(value));
}

function resolveStreamId(
  stream: LayoutComputeInstanceUnreadInput["streams"][number],
): number | null {
  const streamIdRaw = (stream as LayoutStreamWithTopics).stream_id;
  if (typeof streamIdRaw !== "number" || !Number.isInteger(streamIdRaw)) return null;
  return streamIdRaw;
}

function sumStreamBadgeWhenTopicsUnknown(
  stream: LayoutComputeInstanceUnreadInput["streams"][number],
  streamId: number | null,
  predicates: LayoutStreamUnreadMutePredicates,
): number {
  if (streamId != null && predicates.isStreamMuted?.(streamId)) {
    return 0;
  }
  return toSafeUnreadCount(stream.badge);
}

function sumTopicBadgesForStream(
  stream: LayoutStreamWithTopics,
  streamId: number,
  predicates: LayoutStreamUnreadMutePredicates,
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

export function computeInstanceStreamUnreadCountWithMute(
  streams: LayoutComputeInstanceUnreadInput["streams"],
  predicates: LayoutStreamUnreadMutePredicates,
): number {
  let total = 0;

  for (const stream of streams) {
    const streamId = resolveStreamId(stream);
    const topics = (stream as LayoutStreamWithTopics).topics;

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

export { toSafeUnreadCount };
