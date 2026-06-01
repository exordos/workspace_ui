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

function streamTopicsToSidebarTopics(s: StreamEntryInternal) {
  return Array.from(s.topics.values())
    .sort((a, b) => b.ts - a.ts)
    .map((t) => ({
      subject: t.subject,
      lastMessage: t.lastMessage,
      lastMessageSenderName: t.lastMessageSenderName,
      time: t.time,
      badge: t.unreadCount > 0 ? t.unreadCount : undefined,
    }));
}

function streamEntryToTimestampedChat(s: StreamEntryInternal): TimestampedSidebarChat {
  const topics = streamTopicsToSidebarTopics(s);
  const badge = topics.reduce((sum, t) => sum + (t.badge ?? 0), 0);
  return {
    ts: s.ts,
    c: {
      type: "stream",
      stream_id: s.stream_id,
      name: s.name,
      lastMessage: s.lastMessage,
      lastMessageSenderName: s.lastMessageSenderName,
      time: s.time,
      topics,
      badge: badge > 0 ? badge : undefined,
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
      isGroup: x.isGroup,
      lastMessage: x.lastMessage,
      time: x.time,
      userIds: x.userIds,
      badge: x.unreadCount > 0 ? x.unreadCount : undefined,
      avatar_url: x.avatar_url,
    },
  };
}

export function buildTimestampedSidebarChats(
  streamsMap: Map<number, StreamEntryInternal>,
  dmsMap: Map<string, DmEntryInternal>,
  hideUnknownArchivedStreams: boolean,
): TimestampedSidebarChat[] {
  const withTs: TimestampedSidebarChat[] = [];
  for (const s of streamsMap.values()) {
    if (s.isArchived === true) continue;
    if (hideUnknownArchivedStreams && s.isArchived == null) continue;
    withTs.push(streamEntryToTimestampedChat(s));
  }
  for (const x of dmsMap.values()) {
    withTs.push(dmEntryToTimestampedChat(x));
  }
  return withTs;
}
