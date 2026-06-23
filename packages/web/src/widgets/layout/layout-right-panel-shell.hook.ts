/**
 * Right drawer + chat info wiring for Layout: drawer context, profile autoload,
 * panel user card, chat-info sync, presence fallbacks, resolved panel title.
 */
import { useMemo } from "react";
import type { WorkspaceInstance } from "~/entities/instance/instance.model";
import type { UserRecord } from "~/entities/user/user.model";
import { useUsersStore } from "~/entities/user/user.model";
import { t } from "~/i18n/i18n";
import { isNumericUserId, type UserId } from "~/shared/lib/user-id.lib";
import type { StreamEntryInternal } from "~/shared/types/sidebar-chat";
import type { RightDrawerMode } from "~/widgets/right-panel/right-drawer.model";
import type { RightPanelUserInfo } from "~/widgets/right-panel/right-panel.types";
import type { SidebarChat, StreamWithLast } from "~/widgets/sidebar/sidebar.types";
import { useLayoutChatInfoSync } from "./layout-chat-info-sync.hook";
import { useLayoutRightDrawerContext } from "./layout-right-drawer-context.hook";
import { resolveLayoutRightPanelTitle } from "./layout-right-drawer-title.lib";
import { useLayoutRightPanelUser } from "./layout-right-panel-user.hook";
import { useLayoutUserProfileAutoload } from "./layout-user-profile-autoload.hook";
import { useLayoutUserStatusFallback } from "./layout-user-status-fallback.hook";

export interface UseLayoutRightPanelShellParams {
  instances: readonly WorkspaceInstance[];
  currentInstanceId: string | null;
  currentUserStatus: "idle" | "loading" | "ready" | "degraded" | "blocked";
  streamsFromStore: StreamWithLast[];
  dmsFromStore: SidebarChat[];
  streamsMap: Map<string, StreamEntryInternal>;
  activeStreamSlug: string | undefined;
  activeTopic: string | null;
  dmIdParam: string | undefined;
  currentUserId: UserId | null;
  rightDrawerOpen: boolean;
  rightDrawerMode: RightDrawerMode;
  rightDrawerUserIdOverride: UserId | null;
  usersMapForChatInfo: Map<string, UserRecord>;
}

export interface LayoutRightPanelShellResult {
  rightPanelTitleResolved: string;
  participantsCount: number;
  onlineCount: number;
  rightPanelUser: RightPanelUserInfo | undefined;
}

export function useLayoutRightPanelShell(
  params: UseLayoutRightPanelShellParams,
): LayoutRightPanelShellResult {
  const {
    instances,
    currentInstanceId,
    currentUserStatus,
    streamsFromStore,
    dmsFromStore,
    streamsMap,
    activeStreamSlug,
    activeTopic,
    dmIdParam,
    currentUserId,
    rightDrawerOpen,
    rightDrawerMode,
    rightDrawerUserIdOverride,
    usersMapForChatInfo,
  } = params;

  const rightDrawerOverrideUser = useUsersStore((s) =>
    rightDrawerUserIdOverride != null ? s.getUser(rightDrawerUserIdOverride) : undefined,
  );
  const rightDrawerOverrideUserName = rightDrawerOverrideUser?.full_name?.trim();

  const {
    title: rightDrawerTitle,
    rightDrawerTargetUserId,
    partnerUserId,
    dmChat,
    dmParticipantIds,
    activeStreamId,
    activeStreamName,
  } = useLayoutRightDrawerContext({
    streams: streamsFromStore,
    dms: dmsFromStore,
    streamsMap,
    activeStreamSlug,
    activeTopic,
    dmIdParam,
    currentUserId,
    rightDrawerMode,
    rightDrawerUserIdOverride,
    rightDrawerOverrideUserName,
    rightDrawerOpen,
  });

  useLayoutUserProfileAutoload({
    currentInstanceId,
    rightDrawerMode,
    rightDrawerTargetUserId,
    rightDrawerOpen,
  });

  const currentInstanceRealm = useMemo(
    () => instances.find((instance) => instance.id === currentInstanceId)?.realm,
    [instances, currentInstanceId],
  );

  const rightPanelUser = useLayoutRightPanelUser({
    rightDrawerTargetUserId,
    dmChat,
    dms: dmsFromStore,
    currentInstanceRealm,
  });

  const chatInfoTopics = useMemo(() => {
    if (activeStreamId == null) return [];
    return Array.from(streamsMap.get(activeStreamId)?.topics.values() ?? []).map((topic) => ({
      name: topic.subject,
      ...(topic.topicUuid != null ? { topicUuid: topic.topicUuid } : {}),
      unreadCount: topic.unreadCount,
      ...(topic.isDone === true ? { isDone: true } : {}),
    }));
  }, [activeStreamId, streamsMap]);

  const { chatInfoData } = useLayoutChatInfoSync({
    currentInstanceId,
    dmChat,
    dmParticipantIds,
    activeStreamId,
    activeStreamName,
    topics: chatInfoTopics,
    usersMapForChatInfo,
  });

  const rightPanelMemberStatusIds = useMemo(() => {
    if (!rightDrawerOpen) return [];
    if (chatInfoData?.type !== "stream" && chatInfoData?.type !== "dm") {
      return [];
    }
    return chatInfoData.members
      .slice(0, 40)
      .map((member) => member.userId)
      .filter(isNumericUserId);
  }, [chatInfoData, rightDrawerOpen]);

  useLayoutUserStatusFallback({
    enabled: currentUserStatus === "ready" || currentUserStatus === "degraded",
    currentUserId,
    partnerUserId,
    rightDrawerOpen,
    rightDrawerTargetUserId,
    rightPanelMemberStatusIds,
  });

  const rightPanelTitleResolved = resolveLayoutRightPanelTitle(
    rightDrawerMode,
    rightDrawerTitle,
    t,
  );

  return {
    rightPanelTitleResolved,
    participantsCount: chatInfoData?.memberCount ?? 0,
    onlineCount: chatInfoData?.onlineCount ?? 0,
    rightPanelUser: rightPanelUser ?? undefined,
  };
}
