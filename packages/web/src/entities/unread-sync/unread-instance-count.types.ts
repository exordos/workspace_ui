// Minimal shapes needed for unread count math.
export interface UnreadBadgeHolder {
  badge?: number | null;
}

export interface UnreadStreamBadgeHolder extends UnreadBadgeHolder {
  stream_id?: number | null;
  topics?: readonly { subject?: string; badge?: number | null }[] | null;
}

export interface UnreadDmBadgeHolder extends UnreadBadgeHolder {
  isGroup?: boolean;
  slug?: string;
  userIds?: readonly number[];
}

export interface ComputeInstanceUnreadInput {
  streams: readonly UnreadStreamBadgeHolder[];
  dms: readonly UnreadDmBadgeHolder[];
}
