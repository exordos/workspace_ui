/**
 * Sidebar badge totals derived from chat-list maps (O(streams×topics + dms)).
 *
 * Computed when maps change, not on every unrelated store field update.
 */
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import type { DmEntryInternal, StreamEntryInternal } from "~/shared/types/sidebar-chat";

export interface SidebarUnreadMutePredicates {
  isStreamMuted?: (streamId: number) => boolean;
  isEffectivelyMuted?: (streamId: number, topic: string) => boolean;
}

export function computeSidebarUnreadTotals(
  streamsMap: Map<number, StreamEntryInternal>,
  dmsMap: Map<string, DmEntryInternal>,
): { sidebarStreamsUnread: number; sidebarDmsUnread: number } {
  let sidebarStreamsUnread = 0;
  for (const stream of streamsMap.values()) {
    for (const topic of stream.topics.values()) {
      sidebarStreamsUnread += topic.unreadCount;
    }
  }
  let sidebarDmsUnread = 0;
  for (const dm of dmsMap.values()) {
    sidebarDmsUnread += dm.unreadCount;
  }
  return { sidebarStreamsUnread, sidebarDmsUnread };
}

export function computeSidebarUnreadTotalsWithMute(
  streamsMap: Map<number, StreamEntryInternal>,
  dmsMap: Map<string, DmEntryInternal>,
  predicates: SidebarUnreadMutePredicates,
): { sidebarStreamsUnread: number; sidebarDmsUnread: number } {
  let sidebarStreamsUnread = 0;
  for (const stream of streamsMap.values()) {
    if (predicates.isStreamMuted?.(stream.stream_id)) {
      continue;
    }
    for (const topic of stream.topics.values()) {
      if (predicates.isEffectivelyMuted?.(stream.stream_id, topic.subject)) {
        continue;
      }
      sidebarStreamsUnread += topic.unreadCount;
    }
  }

  let sidebarDmsUnread = 0;
  for (const dm of dmsMap.values()) {
    sidebarDmsUnread += dm.unreadCount;
  }
  return { sidebarStreamsUnread, sidebarDmsUnread };
}

export function applySidebarUnreadDeltas(
  current: { sidebarStreamsUnread: number; sidebarDmsUnread: number },
  delta: { streams?: number; dms?: number },
): { sidebarStreamsUnread: number; sidebarDmsUnread: number } {
  return {
    sidebarStreamsUnread: current.sidebarStreamsUnread + (delta.streams ?? 0),
    sidebarDmsUnread: current.sidebarDmsUnread + (delta.dms ?? 0),
  };
}

export function countMentionsUnread(
  messages: readonly ZulipRawMessage[] | null,
  currentUserId: number | null,
): number {
  if (messages == null) return 0;
  let count = 0;
  for (const message of messages) {
    if (currentUserId != null && message.sender_id === currentUserId) continue;
    const flags = message.flags ?? [];
    if (flags.includes("mentioned") && !flags.includes("read")) {
      count += 1;
    }
  }
  return count;
}
