import type { CurrentChatContext } from "~/entities/message/message.model.types";

export interface TopicResolveTarget {
  streamId: number;
  topic: string;
}

export type MarkTopicResolvedBlocker =
  | "no_context"
  | "not_stream"
  | "stream_wide_view"
  | "empty_topic"
  | "no_stream_slug"
  | "no_current_user";

export interface MarkTopicResolvedVisibility {
  canToggle: boolean;
  blockers: MarkTopicResolvedBlocker[];
  hasTarget: boolean;
  hasStreamSlug: boolean;
  currentUserId: number | null;
  streamId: number | null;
  streamNameFromMap: string;
  streamNameFromContext: string;
  effectiveStreamName: string;
  streamSlug: string | null;
  contextType: CurrentChatContext["type"] | null;
  streamWideView: boolean | undefined;
  topic: string | null;
}

export function resolveEffectiveStreamName(
  streamNameFromMap: string,
  streamNameFromContext: string,
): string {
  const fromMap = streamNameFromMap.trim();
  if (fromMap.length > 0) {
    return fromMap;
  }
  return streamNameFromContext.trim();
}

export function resolveMarkTopicResolvedVisibility(options: {
  context: CurrentChatContext | null;
  currentUserId: number | null;
  streamNameFromMap: string;
  buildStreamSlug: (streamId: number, streamName: string) => string;
}): MarkTopicResolvedVisibility {
  const { context, currentUserId, streamNameFromMap, buildStreamSlug } = options;
  const target = resolveTopicResolveTargetFromContext(context);
  const streamNameFromContext =
    context?.type === "stream" ? (context.streamName?.trim() ?? "") : "";
  const effectiveStreamName = resolveEffectiveStreamName(streamNameFromMap, streamNameFromContext);
  const streamId = target?.streamId ?? null;
  const streamSlug =
    streamId != null && effectiveStreamName.length > 0
      ? buildStreamSlug(streamId, effectiveStreamName)
      : null;

  const blockers: MarkTopicResolvedBlocker[] = [];
  if (context == null) {
    blockers.push("no_context");
  } else if (context.type !== "stream") {
    blockers.push("not_stream");
  } else if (context.streamWideView === true) {
    blockers.push("stream_wide_view");
  } else if (context.topic.trim().length === 0) {
    blockers.push("empty_topic");
  }
  if (target == null && blockers.length === 0) {
    blockers.push("no_context");
  }
  if (streamSlug == null) {
    blockers.push("no_stream_slug");
  }
  if (currentUserId == null) {
    blockers.push("no_current_user");
  }

  const hasTarget = target != null;
  const hasStreamSlug = streamSlug != null;
  const canToggle = hasTarget && hasStreamSlug && currentUserId != null;

  return {
    canToggle,
    blockers,
    hasTarget,
    hasStreamSlug,
    currentUserId,
    streamId,
    streamNameFromMap,
    streamNameFromContext,
    effectiveStreamName,
    streamSlug,
    contextType: context?.type ?? null,
    streamWideView: context?.type === "stream" ? context.streamWideView : undefined,
    topic: target?.topic ?? null,
  };
}

export function resolveTopicResolveTargetFromContext(
  context: CurrentChatContext | null,
): TopicResolveTarget | null {
  if (context?.type !== "stream") {
    return null;
  }
  if (context.streamWideView === true) {
    return null;
  }
  const topic = context.topic.trim();
  if (topic.length === 0) {
    return null;
  }
  return { streamId: context.streamId, topic: context.topic };
}
