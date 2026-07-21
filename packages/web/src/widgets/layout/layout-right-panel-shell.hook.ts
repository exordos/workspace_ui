import { useMemo } from "react";
import {
  selectWorkspaceRightPanelInfoView,
  type WorkspaceRightPanelInfoView,
} from "~/entities/messenger/messenger-right-panel.lib";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerUuid } from "~/entities/messenger/messenger.types";
import { useUsersStore } from "~/entities/user/user.model";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import { t } from "~/i18n/i18n";
import type { WorkspaceMessengerRouteMatch } from "~/shared/lib/workspace-messenger-route.lib";
import type { StreamEntryInternal } from "~/shared/types/sidebar-chat";
import type { RightDrawerMode } from "~/widgets/right-panel/right-drawer.model";
import type { SidebarChat, StreamWithLast } from "~/widgets/sidebar/sidebar.types";
import { useLayoutRightDrawerContext } from "./layout-right-drawer-context.hook";
import { resolveLayoutRightPanelTitle } from "./layout-right-drawer-title.lib";

export interface UseLayoutRightPanelShellParams {
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
  rightDrawerWorkspaceUserUuidOverride: MessengerUuid | null;
  mutedStreamIds: Set<number>;
  usersMapForRightDrawer: Map<number, { full_name?: string; email?: string }>;
  workspaceRoute: WorkspaceMessengerRouteMatch | null;
}

export interface LayoutRightPanelShellResult {
  /** Shell title for RightDrawer header (panel purpose). */
  rightDrawerTitle: string;
  /** Entity title for RightPanel content (channel/user name). */
  rightPanelTitleResolved: string;
  participantsCount: number;
  onlineCount: number;
  workspaceRightPanelInfo: WorkspaceRightPanelInfoView | null;
}

export function useLayoutRightPanelShell(
  params: UseLayoutRightPanelShellParams,
): LayoutRightPanelShellResult {
  const {
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
    rightDrawerWorkspaceUserUuidOverride,
    usersMapForRightDrawer,
    workspaceRoute,
  } = params;
  const workspaceMessengerActive = workspaceRoute != null;

  const rightDrawerOverrideUser =
    rightDrawerUserIdOverride != null
      ? usersMapForRightDrawer.get(rightDrawerUserIdOverride)
      : null;
  const rightDrawerOverrideUserName = rightDrawerOverrideUser?.full_name?.trim();

  const { title: rightDrawerTitle } = useLayoutRightDrawerContext({
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

  const workspaceConversationsById = useMessengerStore((state) => state.conversationsById);
  const workspaceStreamsById = useMessengerStore((state) => state.streamsById);
  const workspaceTopicsById = useMessengerStore((state) => state.topicsById);
  const workspaceTopicIds = useMessengerStore((state) => state.topicIds);
  const workspaceStreamBindingsById = useMessengerStore((state) => state.streamBindingsById);
  const workspaceStreamBindingIdsByStreamId = useMessengerStore(
    (state) => state.streamBindingIdsByStreamId,
  );
  const workspaceUsersById = useUsersStore((state) => state.usersById);
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
  // Workspace right panel reads chat structure from messenger store and user cards
  // from the new user store.
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
        },
        {
          route: workspaceRoute,
          usersById: workspaceUsersById,
          fallbackTitle: rightDrawerTitle || t("chat.generalChat"),
          currentUserUuid: workspaceCurrentUserUuid,
          workspaceUserUuidOverride: rightDrawerWorkspaceUserUuidOverride,
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
      rightDrawerWorkspaceUserUuidOverride,
      workspaceUsersById,
    ],
  );
  const effectiveWorkspaceRightPanelInfo = useMemo<WorkspaceRightPanelInfoView | null>(() => {
    if (!workspaceMessengerActive) return null;
    if (workspaceRightPanelInfo != null) return workspaceRightPanelInfo;
    return {
      kind: "channel",
      streamUuid: null,
      notificationMode: null,
      title: t("workspaceMessenger.temporarilyNotConnected"),
      color: null,
      description: null,
      participantsCount: 0,
      onlineCount: 0,
      members: [],
      topics: [],
    };
  }, [workspaceMessengerActive, workspaceRightPanelInfo]);

  const rightDrawerShellTitle = resolveLayoutRightPanelTitle(
    rightDrawerMode,
    t,
    effectiveWorkspaceRightPanelInfo?.kind ?? null,
  );
  const workspaceParticipantsCount =
    effectiveWorkspaceRightPanelInfo?.kind === "channel"
      ? effectiveWorkspaceRightPanelInfo.participantsCount
      : null;
  const workspaceOnlineCount =
    effectiveWorkspaceRightPanelInfo?.kind === "channel"
      ? effectiveWorkspaceRightPanelInfo.onlineCount
      : null;

  return {
    rightDrawerTitle: rightDrawerShellTitle,
    // Entity name for panel body; chat-context title is the fallback when info is absent.
    rightPanelTitleResolved: effectiveWorkspaceRightPanelInfo?.title ?? rightDrawerTitle,
    participantsCount: workspaceParticipantsCount ?? 0,
    onlineCount: workspaceOnlineCount ?? 0,
    workspaceRightPanelInfo: effectiveWorkspaceRightPanelInfo,
  };
}
