/**
 * Comparator helpers for sidebar chat ordering.
 */
import type { SidebarChat } from "~/shared/types/sidebar-chat";
export interface ChatSortingOptions {
  prioritizePersonalUnread?: boolean;
  prioritizeUnmutedUnreadChannels?: boolean;
  hideUnknownArchivedStreams?: boolean;
  isEffectivelyMuted?: (streamId: number, topic: string) => boolean;
}

export type ResolvedChatSortingOptions = ChatSortingOptions &
  Required<
    Pick<
      ChatSortingOptions,
      "prioritizePersonalUnread" | "prioritizeUnmutedUnreadChannels" | "hideUnknownArchivedStreams"
    >
  >;

interface TimestampedChat {
  c: SidebarChat;
  ts: number;
}

function comparePersonalUnreadPriority(a: SidebarChat, b: SidebarChat): number {
  const aHasUnread = (a.badge ?? 0) > 0;
  const bHasUnread = (b.badge ?? 0) > 0;
  if (!aHasUnread || !bHasUnread) return 0;
  const aIsPersonalDm = a.type === "dm" && !a.isGroup;
  const bIsPersonalDm = b.type === "dm" && !b.isGroup;
  if (aIsPersonalDm && !bIsPersonalDm) return -1;
  if (!aIsPersonalDm && bIsPersonalDm) return 1;
  return 0;
}

function compareUnmutedUnreadStreams(a: SidebarChat, b: SidebarChat, muteSet: Set<number>): number {
  const aHasUnread = (a.badge ?? 0) > 0;
  const bHasUnread = (b.badge ?? 0) > 0;
  if (!aHasUnread || !bHasUnread) return 0;
  if (a.type !== "stream" || b.type !== "stream") return 0;
  const aIsMuted = muteSet.has(a.stream_id);
  const bIsMuted = muteSet.has(b.stream_id);
  if (aIsMuted === bIsMuted) return 0;
  return aIsMuted ? 1 : -1;
}

function compareMutedStreamPartition(a: SidebarChat, b: SidebarChat, muteSet: Set<number>): number {
  const aIsMuted = a.type === "stream" && muteSet.has(a.stream_id);
  const bIsMuted = b.type === "stream" && muteSet.has(b.stream_id);
  if (aIsMuted === bIsMuted) return 0;
  return aIsMuted ? 1 : -1;
}

function dmRecentRank(
  c: SidebarChat,
  ts: number,
  recentDmIds: readonly number[],
): [number, number] {
  if (c.type !== "dm" || c.isGroup) return [9999, -ts];
  const idx = recentDmIds.indexOf(c.id);
  return [idx >= 0 ? idx : 9999, -ts];
}

function compareDmChatsByRecentActivity(
  a: TimestampedChat,
  b: TimestampedChat,
  recentDmIds: readonly number[],
): number {
  const [aR, aT] = dmRecentRank(a.c, a.ts, recentDmIds);
  const [bR, bT] = dmRecentRank(b.c, b.ts, recentDmIds);
  if (aR !== bR) return aR - bR;
  return aT - bT;
}

export function compareChatsByActivity(
  a: TimestampedChat,
  b: TimestampedChat,
  recentDmIds: readonly number[],
  options: ResolvedChatSortingOptions,
  muteSet: Set<number>,
): number {
  const mutedPartition = compareMutedStreamPartition(a.c, b.c, muteSet);
  if (mutedPartition !== 0) return mutedPartition;

  const personalUnread = options.prioritizePersonalUnread
    ? comparePersonalUnreadPriority(a.c, b.c)
    : 0;
  if (personalUnread !== 0) return personalUnread;

  const unmutedStreams = options.prioritizeUnmutedUnreadChannels
    ? compareUnmutedUnreadStreams(a.c, b.c, muteSet)
    : 0;
  if (unmutedStreams !== 0) return unmutedStreams;

  if (a.c.type === "dm" && b.c.type === "dm") {
    return compareDmChatsByRecentActivity(a, b, recentDmIds);
  }

  return b.ts - a.ts;
}
