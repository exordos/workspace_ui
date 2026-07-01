/**
 * Builds timestamped sidebar chat rows from stream/DM maps (no sorting).
 */

import type {
  SidebarChat,
  StreamEntryInternal,
  DmEntryInternal,
} from "~/shared/types/sidebar-chat";

export interface TimestampedSidebarChat {
  c: SidebarChat;
  ts: number;
}

export interface SidebarChatMuteProjectionOptions {
  mutedStreamIds?: Set<string>;
  isEffectivelyMuted?: (streamId: string, topic: string) => boolean;
}

function streamTopicsToSidebarTopics(
  s: StreamEntryInternal,
  options: SidebarChatMuteProjectionOptions,
) {
  const streamMuted = options.mutedStreamIds?.has(s.streamUuid) ?? false;
  return Array.from(s.topics.values())
    .sort((a, b) => b.ts - a.ts)
    .map((t) => {
      const topicMuted =
        streamMuted || (options.isEffectivelyMuted?.(s.streamUuid, t.subject) ?? false);
      return {
        ...(t.topicUuid != null ? { topicUuid: t.topicUuid } : {}),
        subject: t.subject,
        lastMessage: t.lastMessage,
        lastMessageSenderName: t.lastMessageSenderName,
        time: t.time,
        ...(t.color != null ? { color: t.color } : {}),
        badge: !topicMuted && t.unreadCount > 0 ? t.unreadCount : undefined,
      };
    });
}

function streamEntryToTimestampedChat(
  s: StreamEntryInternal,
  options: SidebarChatMuteProjectionOptions,
): TimestampedSidebarChat {
  const topics = streamTopicsToSidebarTopics(s, options);
  const streamMuted = options.mutedStreamIds?.has(s.streamUuid) ?? false;
  const unreadCount = s.unreadCount ?? 0;
  const badge = !streamMuted && unreadCount > 0 ? unreadCount : undefined;
  return {
    ts: s.ts,
    c: {
      type: "stream",
      streamUuid: s.streamUuid,
      private: s.private,
      ...(s.color != null ? { color: s.color } : {}),
      name: s.name,
      lastMessage: s.lastMessage,
      lastMessageSenderName: s.lastMessageSenderName,
      time: s.time,
      topics,
      badge,
    },
  };
}

function dmEntryToTimestampedChat(x: DmEntryInternal): TimestampedSidebarChat {
  return {
    ts: x.ts,
    c: {
      type: "dm",
      id: x.id,
      name: x.name,
      slug: x.slug,
      lastMessage: x.lastMessage,
      time: x.time,
      userIds: x.userIds,
      badge: x.unreadCount > 0 ? x.unreadCount : undefined,
      avatar_url: x.avatar_url,
    },
  };
}

export function buildTimestampedSidebarChats(
  streamsMap: Map<string, StreamEntryInternal>,
  dmsMap: Map<string, DmEntryInternal>,
  hideUnknownArchivedStreams: boolean,
  options: SidebarChatMuteProjectionOptions = {},
): TimestampedSidebarChat[] {
  const withTs: TimestampedSidebarChat[] = [];
  for (const s of streamsMap.values()) {
    if (s.isArchived === true) continue;
    if (hideUnknownArchivedStreams && s.isArchived == null) continue;
    withTs.push(streamEntryToTimestampedChat(s, options));
  }
  for (const x of dmsMap.values()) {
    withTs.push(dmEntryToTimestampedChat(x));
  }
  return withTs;
}
