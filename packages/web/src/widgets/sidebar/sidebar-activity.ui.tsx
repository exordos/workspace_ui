import React from "react";
import { useActivityStore } from "~/entities/activity/activity.model";
import { computeSidebarUnreadTotalsWithMute } from "~/entities/chat-list/chat-list-sidebar-totals.lib";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useDraftStore } from "~/entities/draft/draft.model";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import { SidebarActivityView } from "./sidebar-activity-view.ui";
import type { SidebarActivityProps } from "./sidebar-activity.types";

export const SidebarActivity: React.FC<SidebarActivityProps> = ({ open, onToggle }) => {
  const currentUserId = useChatListStore((s) => s.currentUserId);
  const streamsMap = useChatListStore((s) => s.streamsMap);
  const dmsMap = useChatListStore((s) => s.dmsMap);
  const mutedStreamIds = useMuteStore((s) => s.mutedStreamIds);
  const mutedTopicKeys = useMuteStore((s) => s.mutedTopicKeys);
  const unmutedTopicKeys = useMuteStore((s) => s.unmutedTopicKeys);
  const followedTopicKeys = useMuteStore((s) => s.followedTopicKeys);
  const isStreamMuted = useMuteStore((s) => s.isStreamMuted);
  const isEffectivelyMuted = useMuteStore((s) => s.isEffectivelyMuted);
  const inboxCount = React.useMemo(() => {
    const totals = computeSidebarUnreadTotalsWithMute(streamsMap, dmsMap, {
      isStreamMuted,
      isEffectivelyMuted,
    });
    return totals.sidebarStreamsUnread + totals.sidebarDmsUnread;
  }, [
    dmsMap,
    followedTopicKeys,
    isEffectivelyMuted,
    isStreamMuted,
    mutedStreamIds,
    mutedTopicKeys,
    streamsMap,
    unmutedTopicKeys,
  ]);
  const mentionsCount = useChatListStore((s) => s.mentionsUnreadCount);
  const draftsCount = useDraftStore((s) => s.nonEmptyDraftCount);
  const isCompactDensity = useSettingsStore((s) => s.chatListDensity === "compact");
  const favoritesCount = useActivityStore((s) => s.starredSummary.count);
  const favoritesError = useActivityStore((s) => s.starredSummary.error);

  return (
    <SidebarActivityView
      open={open}
      onToggle={onToggle}
      counts={{
        inbox: inboxCount,
        mentions: mentionsCount,
        drafts: draftsCount,
        favorites: favoritesCount,
      }}
      showPrivateNotes={currentUserId != null}
      isCompactDensity={isCompactDensity}
      favoritesError={favoritesError}
    />
  );
};
