export interface LayoutBadgeHolder {
  badge?: number | null;
  /**
   * Optional stream id — available when caller passes sidebar stream entries.
   * Used for unread total adjustments (e.g. excluding muted streams/topics).
   */
  stream_id?: number | null;
  /**
   * Optional topics list — available when caller passes sidebar stream entries.
   * Used for unread total adjustments (e.g. excluding muted topics).
   */
  topics?: readonly { subject?: string; badge?: number | null }[] | null;
}

export interface LayoutDmBadgeHolder extends LayoutBadgeHolder {
  isGroup?: boolean;
  slug?: string;
  userIds?: readonly number[];
}

export interface LayoutComputeInstanceUnreadInput {
  streams: readonly LayoutBadgeHolder[];
  dms: readonly LayoutDmBadgeHolder[];
}

export interface LayoutBuildActiveChatWindowTitleInput {
  dmName?: string | null;
  streamName?: string | null;
  topicName?: string | null;
}
