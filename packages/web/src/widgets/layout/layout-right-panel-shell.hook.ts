/**
 * Right drawer + chat info wiring for Layout: drawer context, profile autoload,
 * panel user card, chat-info sync, presence fallbacks, resolved panel title.
 */
import { useMemo } from "react";
import type { ZulipInstance } from "~/entities/instance/instance.model";
import {
  selectWorkspaceRightPanelInfoView,
  type WorkspaceRightPanelInfoView,
} from "~/entities/messenger/messenger-right-panel.lib";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import { useUsersStore } from "~/entities/user/user.model";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import { t } from "~/i18n/i18n";
import type { WorkspaceMessengerRouteMatch } from "~/shared/lib/workspace-messenger-route.lib";
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
  instances: readonly ZulipInstance[];
  currentInstanceId: string | null;
  currentUserStatus: "idle" | "loading" | "ready" | "degraded" | "blocked";
  streamsFromStore: StreamWithLast[];
  dmsFromStore: SidebarChat[];
  streamsMap: Map<number, StreamEntryInternal>;
  activeStreamSlug: string | undefined;
  activeTopic: string | null;
  dmIdParam: string | undefined;
  currentUserId: number | null;
  rightDrawerOpen: boolean;
  rightDrawerMode: RightDrawerMode;
  rightDrawerUserIdOverride: number | null;
  mutedStreamIds: Set<number>;
  usersMapForChatInfo: Map<number, { full_name?: string; email?: string }>;
  workspaceRoute: WorkspaceMessengerRouteMatch | null;
}

export interface LayoutRightPanelShellResult {
  rightPanelTitleResolved: string;
  participantsCount: number;
  onlineCount: number;
  rightPanelUser: RightPanelUserInfo | undefined;
  workspaceRightPanelInfo: WorkspaceRightPanelInfoView | null;
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
    mutedStreamIds,
    usersMapForChatInfo,
    workspaceRoute,
  } = params;
  const workspaceMessengerActive = workspaceRoute != null;

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
      unreadCount: topic.unreadCount,
    }));
  }, [activeStreamId, streamsMap]);

  const { chatInfoData } = useLayoutChatInfoSync({
    enabled: !workspaceMessengerActive,
    currentInstanceId,
    dmChat,
    dmParticipantIds,
    activeStreamId,
    activeStreamName,
    mutedStreamIds,
    topics: chatInfoTopics,
    usersMapForChatInfo,
  });

  const workspaceConversationsById = useMessengerStore((state) => state.conversationsById);
  const workspaceStreamsById = useMessengerStore((state) => state.streamsById);
  const workspaceTopicsById = useMessengerStore((state) => state.topicsById);
  const workspaceTopicIds = useMessengerStore((state) => state.topicIds);
  const workspaceStreamBindingsById = useMessengerStore((state) => state.streamBindingsById);
  const workspaceStreamBindingIdsByStreamId = useMessengerStore(
    (state) => state.streamBindingIdsByStreamId,
  );
  const workspaceUsersById = useMessengerStore((state) => state.usersById);
  const workspaceSessions = useWorkspaceAuthStore((state) => state.sessions);
  const workspaceCurrentAccountId = useWorkspaceAuthStore((state) => state.currentAccountId);
  const workspaceRuntimeContext = useMemo(
    () =>
      selectCurrentWorkspaceRuntimeContext({
        sessions: workspaceSessions,
        currentAccountId: workspaceCurrentAccountId,
      }),
    [workspaceCurrentAccountId, workspaceSessions],
  );
  const workspaceCurrentUserUuid = workspaceRuntimeContext?.userUuid ?? null;
  // Workspace right panel строится из нового messenger store, а не из старого
  // Zulip chatInfo. Так участники, счетчики и права удаления остаются в одном
  // UUID-based источнике данных.
  const workspaceRightPanelInfo = useMemo(
    () =>
      selectWorkspaceRightPanelInfoView(
        {
          conversationsById: workspaceConversationsById,
          streamsById: workspaceStreamsById,
          topicsById: workspaceTopicsById,
          topicIds: workspaceTopicIds,
          streamBindingsById: workspaceStreamBindingsById,
          streamBindingIdsByStreamId: workspaceStreamBindingIdsByStreamId,
          usersById: workspaceUsersById,
        },
        {
          route: workspaceRoute,
          fallbackTitle: rightDrawerTitle || t("chat.generalChat"),
          currentUserUuid: workspaceCurrentUserUuid,
          temporarilyNotConnectedText: t("workspaceMessenger.temporarilyNotConnected"),
        },
      ),
    [
      rightDrawerTitle,
      workspaceConversationsById,
      workspaceRoute,
      workspaceStreamBindingIdsByStreamId,
      workspaceStreamBindingsById,
      workspaceStreamsById,
      workspaceTopicIds,
      workspaceTopicsById,
      workspaceCurrentUserUuid,
      workspaceUsersById,
    ],
  );

  const rightPanelMemberStatusIds = useMemo(() => {
    if (!rightDrawerOpen) return [];
    if (chatInfoData?.type !== "stream" && chatInfoData?.type !== "dm") {
      return [];
    }
    return chatInfoData.members
      .slice(0, 40)
      .map((member) => member.userId)
      .filter((userId) => Number.isFinite(userId) && userId > 0);
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
  const workspaceParticipantsCount =
    workspaceRightPanelInfo?.kind === "channel" ? workspaceRightPanelInfo.participantsCount : null;
  const workspaceOnlineCount =
    workspaceRightPanelInfo?.kind === "channel" ? workspaceRightPanelInfo.onlineCount : null;

  return {
    rightPanelTitleResolved: workspaceRightPanelInfo?.title ?? rightPanelTitleResolved,
    participantsCount: workspaceParticipantsCount ?? chatInfoData?.memberCount ?? 0,
    onlineCount: workspaceOnlineCount ?? chatInfoData?.onlineCount ?? 0,
    rightPanelUser: workspaceMessengerActive ? undefined : (rightPanelUser ?? undefined),
    workspaceRightPanelInfo,
  };
}
