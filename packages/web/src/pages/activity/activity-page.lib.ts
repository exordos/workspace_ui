/**
 * Activity page helpers — route building and message context labels.
 */

import type { Draft } from "~/entities/draft/draft.types";
import type { Reaction } from "~/shared/api/messenger.types";
import type { MessageId } from "~/shared/lib/message-id.lib";
import { formatStreamTopicLabel } from "~/shared/lib/topic-display.lib";
import { numericUserIdOrNull, type UserId } from "~/shared/lib/user-id.lib";
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

  const numericCurrentUserId = numericUserIdOrNull(currentUserId);
  const others =
    numericCurrentUserId != null
      ? recipientIds.filter((id) => id !== numericCurrentUserId)
      : recipientIds;
  if (others.length === 0) return null;

  if (others.length > 1) {
    return null;
  }

  const name = getUserDisplayName(others[0]!).trim();
  return name !== "Unknown" ? name : null;
}

export function formatDraftMessageContext(options: {
  draft: Pick<Draft, "type" | "to" | "topic">;
  streamsMap: ReadonlyMap<string, { name: string }>;
  currentUserId: UserId | null;
  getUserDisplayName: (userId: UserId) => string;
  generalChatLabel: string;
  privateLabel: string;
}): string {
  const { draft, streamsMap, currentUserId, getUserDisplayName, generalChatLabel, privateLabel } =
    options;

  if (draft.type === "stream" && draft.to.length > 0) {
    const streamId = String(draft.to[0]!);
    const streamName = streamsMap.get(streamId)?.name ?? String(streamId);
    return formatActivityMessageContext({
      isStream: true,
      streamName,
      topic: draft.topic?.trim() || null,
      dmName: null,
      generalChatLabel,
      privateLabel,
    });
  }

  if (draft.type === "private") {
    const dmName = resolveDraftDmDisplayName({
      recipientIds: draft.to,
      currentUserId,
      getUserDisplayName,
    });
    return formatActivityMessageContext({
      isStream: false,
      streamName: null,
      topic: null,
      dmName,
      generalChatLabel,
      privateLabel,
    });
  }

  return privateLabel;
}

/** Reactions from others on the current user's message (excludes self). */
export function filterPeerReactions(
  reactions: readonly Reaction[],
  currentUserId: UserId | null,
): Reaction[] {
  const numericCurrentUserId = numericUserIdOrNull(currentUserId);
  if (numericCurrentUserId == null) return [];
  return reactions.filter((reaction) => reaction.user_id !== numericCurrentUserId);
}

export function getActivityPeerReactionGroups(
  reactions: readonly Reaction[],
  currentUserId: UserId | null,
  resolveCustomEmojiImageUrl?: (reaction: Reaction) => string | undefined,
): GroupedReaction[] {
  const peerReactions = filterPeerReactions(reactions, currentUserId);
  if (peerReactions.length === 0) return [];
  return groupReactions(peerReactions, resolveCustomEmojiImageUrl);
}
