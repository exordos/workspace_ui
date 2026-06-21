export interface LayoutBadgeHolder {
  badge?: number | null;
  /**
   * Optional stream UUID — available when caller passes sidebar stream entries.
   * Used for unread total adjustments (e.g. excluding muted streams/topics).
   */
  streamUuid?: string | null;
  /**
   * Optional topics list — available when caller passes sidebar stream entries.
   * Used for unread total adjustments (e.g. excluding muted topics).
   */
  topics?: readonly { subject?: string; badge?: number | null }[] | null;
}

export interface LayoutDmBadgeHolder extends LayoutBadgeHolder {
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
