export interface LayoutBadgeHolder {
  badge?: number | null;
}

export interface LayoutDmBadgeHolder extends LayoutBadgeHolder {
  isGroup?: boolean;
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
