/**
 * Pure chat sorting logic — no store dependencies.
 *
 * Accepts all required data as parameters so it can live in shared/lib/
 * without importing feature or entity stores.
 */
import { loadRecentDmPartners } from "~/shared/lib/recent-dms";
import type {
  SidebarChat,
  StreamEntryInternal,
  DmEntryInternal,
} from "~/shared/types/sidebar-chat";

export interface ChatSortingOptions {
  prioritizePersonalUnread?: boolean;
  prioritizeUnmutedUnreadChannels?: boolean;
  hideUnknownArchivedStreams?: boolean;
}

export function sortChatsByLastMessage(
  streamsMap: Map<number, StreamEntryInternal>,
  dmsMap: Map<string, DmEntryInternal>,
  sorting: string,
  muteSet: Set<number>,
  options: ChatSortingOptions = {},
): SidebarChat[] {
  const prioritizePersonalUnread = options.prioritizePersonalUnread ?? false;
  const prioritizeUnmutedUnreadChannels = options.prioritizeUnmutedUnreadChannels ?? false;
  const hideUnknownArchivedStreams = options.hideUnknownArchivedStreams ?? false;
  const withTs: { c: SidebarChat; ts: number }[] = [];
  for (const s of streamsMap.values()) {
    if (s.isArchived === true) continue;
    if (hideUnknownArchivedStreams && s.isArchived == null) continue;
    const topics = Array.from(s.topics.values())
      .sort((a, b) => b.ts - a.ts)
      .map((t) => ({
        subject: t.subject,
        lastMessage: t.lastMessage,
        lastMessageSenderName: t.lastMessageSenderName,
        time: t.time,
        badge: t.unreadCount > 0 ? t.unreadCount : undefined,
      }));
    const badge = topics.reduce((sum, t) => sum + (t.badge ?? 0), 0);
    withTs.push({
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
    });
  }
  for (const x of dmsMap.values()) {
    withTs.push({
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
    });
  }

  const recentDmIds = loadRecentDmPartners();
  const dmRecentRank = (c: SidebarChat, ts: number): [number, number] => {
    if (c.type !== "dm" || c.isGroup) return [9999, -ts];
    const idx = recentDmIds.indexOf(c.id);
    return [idx >= 0 ? idx : 9999, -ts];
  };

  if (sorting === "alphabetical") {
    withTs.sort((a, b) => {
      const aName = a.c.type === "dm" ? a.c.name : a.c.name;
      const bName = b.c.type === "dm" ? b.c.name : b.c.name;
      return aName.localeCompare(bName);
    });
  } else {
    withTs.sort((a, b) => {
      const aHasUnread = (a.c.badge ?? 0) > 0;
      const bHasUnread = (b.c.badge ?? 0) > 0;

      if (prioritizePersonalUnread && aHasUnread && bHasUnread) {
        const aIsPersonalDm = a.c.type === "dm" && !a.c.isGroup;
        const bIsPersonalDm = b.c.type === "dm" && !b.c.isGroup;
        if (aIsPersonalDm && !bIsPersonalDm) return -1;
        if (!aIsPersonalDm && bIsPersonalDm) return 1;
      }

      if (prioritizeUnmutedUnreadChannels && aHasUnread && bHasUnread) {
        if (a.c.type === "stream" && b.c.type === "stream") {
          const aIsMuted = muteSet.has(a.c.stream_id);
          const bIsMuted = muteSet.has(b.c.stream_id);
          if (aIsMuted !== bIsMuted) {
            return aIsMuted ? 1 : -1;
          }
        }
      }

      if (a.c.type === "dm" && b.c.type === "dm") {
        const [aR, aT] = dmRecentRank(a.c, a.ts);
        const [bR, bT] = dmRecentRank(b.c, b.ts);
        if (aR !== bR) return aR - bR;
        return aT - bT;
      }
      return b.ts - a.ts;
    });
  }

  return withTs.map((x) => x.c);
}
