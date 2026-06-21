import {
  computeInstanceStreamUnreadCountWithMute,
  toSafeUnreadCount,
} from "./unread-instance-count-stream.lib";
import type { ComputeInstanceUnreadInput } from "./unread-instance-count.types";

interface UnreadMutePredicates {
  isStreamMuted?: (streamId: string) => boolean;
  isEffectivelyMuted?: (streamId: string, topic: string) => boolean;
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

// Sums unread badges across all DMs (Workspace DMs are 1:1 only).
export function computeInstanceDmUnreadCount({
  dms,
}: Pick<ComputeInstanceUnreadInput, "dms">): number {
  return dms.reduce((sum, dm) => sum + toSafeUnreadCount(dm.badge), 0);
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
