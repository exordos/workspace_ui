/**
 * Activity page helpers — route building and message context labels.
 */

import type { Draft } from "~/entities/draft/draft.types";

export function buildMessageNavigateRoute(route: string, messageId: number, mode: string): string {
  if (mode !== "forward") {
    return route;
  }
  const separator = route.includes("?") ? "&" : "?";
  return `${route}${separator}forward=${messageId}`;
}

export function formatStreamTopicLabel(topic: string | null, generalChatLabel: string): string {
  if ((topic?.length ?? 0) > 0) {
    return topic!;
  }
  return generalChatLabel;
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
  recipientIds: number[];
  currentUserId: number | null;
  getUserDisplayName: (userId: number) => string;
  groupChatLabel: string;
}): string | null {
  const { recipientIds, currentUserId, getUserDisplayName, groupChatLabel } = options;
  if (recipientIds.length === 0) return null;

  const others =
    currentUserId != null ? recipientIds.filter((id) => id !== currentUserId) : recipientIds;
  if (others.length === 0) return null;

  const isGroup = others.length > 1;
  if (isGroup) {
    const names = others
      .map((id) => {
        const name = getUserDisplayName(id).trim();
        return name !== "Unknown" ? name : "";
      })
      .filter((name) => name.length > 0);
    return names.length > 0 ? names.join(", ") : groupChatLabel;
  }

  const name = getUserDisplayName(others[0]!).trim();
  return name !== "Unknown" ? name : null;
}

export function formatDraftMessageContext(options: {
  draft: Pick<Draft, "type" | "to" | "topic">;
  streamsMap: ReadonlyMap<number, { name: string }>;
  currentUserId: number | null;
  getUserDisplayName: (userId: number) => string;
  generalChatLabel: string;
  privateLabel: string;
  groupChatLabel: string;
}): string {
  const {
    draft,
    streamsMap,
    currentUserId,
    getUserDisplayName,
    generalChatLabel,
    privateLabel,
    groupChatLabel,
  } = options;

  if (draft.type === "stream" && draft.to.length > 0) {
    const streamId = draft.to[0]!;
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
      groupChatLabel,
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
