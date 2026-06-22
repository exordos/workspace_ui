import type { DmEntryInternal, StreamEntryInternal } from "~/shared/types/sidebar-chat";

export interface SidebarUnreadMutePredicates {
  isStreamMuted?: (streamId: string) => boolean;
  isEffectivelyMuted?: (streamId: string, topic: string) => boolean;
}

export function computeSidebarUnreadTotals(
  streamsMap: Map<string, StreamEntryInternal>,
  dmsMap: Map<string, DmEntryInternal>,
): { sidebarStreamsUnread: number; sidebarDmsUnread: number } {
  let sidebarStreamsUnread = 0;
  for (const stream of streamsMap.values()) {
    sidebarStreamsUnread += stream.unreadCount ?? 0;
  }
  let sidebarDmsUnread = 0;
  for (const dm of dmsMap.values()) {
    sidebarDmsUnread += dm.unreadCount;
  }
  return { sidebarStreamsUnread, sidebarDmsUnread };
}

export function computeSidebarUnreadTotalsWithMute(
  streamsMap: Map<string, StreamEntryInternal>,
  dmsMap: Map<string, DmEntryInternal>,
  predicates: SidebarUnreadMutePredicates,
): { sidebarStreamsUnread: number; sidebarDmsUnread: number } {
  let sidebarStreamsUnread = 0;
  for (const stream of streamsMap.values()) {
    if (predicates.isStreamMuted?.(stream.streamUuid)) {
      continue;
    }
    sidebarStreamsUnread += stream.unreadCount ?? 0;
  }

  let sidebarDmsUnread = 0;
  for (const dm of dmsMap.values()) {
    sidebarDmsUnread += dm.unreadCount;
  }
  return { sidebarStreamsUnread, sidebarDmsUnread };
}
