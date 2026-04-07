export interface LayoutBadgeHolder {
  badge?: number | null;
}

export interface LayoutComputeInstanceUnreadInput {
  streams: readonly LayoutBadgeHolder[];
  dms: readonly LayoutBadgeHolder[];
}

export interface LayoutBuildActiveChatWindowTitleInput {
  dmName?: string | null;
  streamName?: string | null;
  topicName?: string | null;
}
