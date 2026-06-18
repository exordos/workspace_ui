import { parseDmRouteParticipantIds } from "~/shared/lib/dm-route-slug.lib";
import { effectiveDmIsGroupFromSlug } from "~/shared/lib/dm-route.lib";
import {
  computeInstanceStreamUnreadCountWithMute,
  toSafeUnreadCount,
} from "./unread-instance-count-stream.lib";
import type {
  ComputeInstanceUnreadInput,
  UnreadDmBadgeHolder,
} from "./unread-instance-count.types";

interface UnreadMutePredicates {
  isStreamMuted?: (streamId: number) => boolean;
  isEffectivelyMuted?: (streamId: number, topic: string) => boolean;
}

type ComputeInstanceUnreadWithMuteInput = ComputeInstanceUnreadInput & UnreadMutePredicates;

// Total unread for one organization: stream unread plus DM unread.
export function computeInstanceUnreadCount({
  streams,
  dms,
  isStreamMuted,
  isEffectivelyMuted,
}: ComputeInstanceUnreadWithMuteInput): number {
  const shouldApplyMuteRules = isStreamMuted != null || isEffectivelyMuted != null;
  const streamUnread = shouldApplyMuteRules
    ? computeInstanceStreamUnreadCountWithMute(streams, { isStreamMuted, isEffectivelyMuted })
    : streams.reduce((sum, stream) => sum + toSafeUnreadCount(stream.badge), 0);
  const dmUnread = computeInstanceDmUnreadCount({ dms });
  return streamUnread + dmUnread;
}

// Some callers pass userIds, some pass route slug. This normalizes both.
function resolveDmSlugUserIds(dm: UnreadDmBadgeHolder): number[] {
  if (Array.isArray(dm.userIds) && dm.userIds.length > 0) {
    return [...dm.userIds];
  }
  if (typeof dm.slug === "string" && dm.slug.length > 0) {
    return parseDmRouteParticipantIds(dm.slug);
  }
  return [];
}

// Personal DMs count for the org dot. Group DMs do not.
export function isPersonalDmUnreadEntry(
  dm: UnreadDmBadgeHolder,
  currentUserId: number | null,
): boolean {
  return !effectiveDmIsGroupFromSlug(dm.isGroup, resolveDmSlugUserIds(dm), currentUserId);
}

// Sums unread badges only for personal DMs.
export function computeInstanceDmUnreadCount({
  dms,
  currentUserId = null,
}: Pick<ComputeInstanceUnreadInput, "dms"> & {
  currentUserId?: number | null;
}): number {
  return dms
    .filter((dm) => isPersonalDmUnreadEntry(dm, currentUserId))
    .reduce((sum, dm) => sum + toSafeUnreadCount(dm.badge), 0);
}

// Used by app/dock/fav icon logic.
export function hasPersonalDmUnreadForActiveInstance(currentInstanceDmUnread: number): boolean {
  return toSafeUnreadCount(currentInstanceDmUnread) > 0;
}

// The organization dot means personal DM unread or unread mentions.
export function hasPersonalUnreadIndicator(
  personalDmUnread: number,
  mentionsUnread: number,
): boolean {
  return toSafeUnreadCount(personalDmUnread) > 0 || toSafeUnreadCount(mentionsUnread) > 0;
}

export { toSafeUnreadCount };
