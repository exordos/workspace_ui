// Minimal shapes needed for unread count math.
import type { UserId } from "~/shared/lib/user-id.lib";

export interface UnreadBadgeHolder {
  badge?: number | null;
}

export interface UnreadStreamBadgeHolder extends UnreadBadgeHolder {
  stream_id?: number | null;
  topics?: readonly { subject?: string; badge?: number | null }[] | null;
}

export interface UnreadDmBadgeHolder extends UnreadBadgeHolder {
  slug?: string;
  userIds?: readonly UserId[];
}

export interface ComputeInstanceUnreadInput {
  streams: readonly UnreadStreamBadgeHolder[];
  dms: readonly UnreadDmBadgeHolder[];
}
