/**
 * Activity page helpers — route building and message context labels.
 */

import type { Draft } from "~/entities/draft/draft.types";
import type { MessageReactions } from "~/shared/api/messenger.types";
import type { MessageId } from "~/shared/lib/message-id.lib";
import { formatStreamTopicLabel } from "~/shared/lib/topic-display.lib";
import { userIdsEqual, type UserId } from "~/shared/lib/user-id.lib";
import {
  groupReactions,
  type GroupedReaction,
} from "~/widgets/message-list/message-bubble-emoji.lib";

export function buildMessageNavigateRoute(
  route: string,
  messageId: MessageId,
  mode: string,
): string {
  if (mode !== "forward") {
    return route;
  }
  const separator = route.includes("?") ? "&" : "?";
  return `${route}${separator}forward=${messageId}`;
}

export function formatActivityMessageContext(options: {
  isStream: boolean;
  streamName: string | null;
  topic: string | null;
  dmName: string | null;
  generalChatLabel: string;
  privateLabel: string;
}): string {
  if (options.isStream) {
    const topicLabel = formatStreamTopicLabel(options.topic, options.generalChatLabel);
    return `#${options.streamName} · ${topicLabel}`;
  }
  if (options.dmName != null) {
    return `${options.privateLabel} · ${options.dmName}`;
  }
  return options.privateLabel;
}

/** Resolves DM title for a draft from recipient user IDs (excludes current user when known). */
export function resolveDraftDmDisplayName(options: {
  recipientIds: UserId[];
  currentUserId: UserId | null;
  getUserDisplayName: (userId: UserId) => string;
}): string | null {
  const { recipientIds, currentUserId, getUserDisplayName } = options;
  if (recipientIds.length === 0) return null;

  const others =
    currentUserId != null
      ? recipientIds.filter((id) => !userIdsEqual(id, currentUserId))
      : recipientIds;
  if (others.length === 0) return null;

  if (others.length > 1) {
    return null;
  }

  const name = getUserDisplayName(others[0]!).trim();
  return name !== "Unknown" ? name : null;
}

export function formatDraftMessageContext(options: {
  draft: Pick<Draft, "stream_uuid" | "topic_uuid">;
  streamsMap: ReadonlyMap<
    string,
    { name: string; topics: ReadonlyMap<string, { topicUuid?: string; subject: string }> }
  >;
  generalChatLabel: string;
  privateLabel: string;
}): string {
  const { draft, streamsMap, generalChatLabel, privateLabel } = options;
  const stream = streamsMap.get(draft.stream_uuid);
  if (stream == null) {
    return privateLabel;
  }
  let topicName: string | null = null;
  for (const topic of stream.topics.values()) {
    if (topic.topicUuid === draft.topic_uuid) {
      topicName = topic.subject;
      break;
    }
  }
  return formatActivityMessageContext({
    isStream: true,
    streamName: stream.name,
    topic: topicName ?? generalChatLabel,
    dmName: null,
    generalChatLabel,
    privateLabel,
  });
}

export function hasReactionCounts(reactions: MessageReactions | undefined): boolean {
  return Object.values(reactions ?? {}).some((count) => Number.isFinite(count) && count > 0);
}

export function getActivityPeerReactionGroups(
  reactions: MessageReactions,
  resolveCustomEmojiImageUrl?: (emojiName: string) => string | undefined,
): GroupedReaction[] {
  if (!hasReactionCounts(reactions)) return [];
  return groupReactions(reactions, resolveCustomEmojiImageUrl);
}
