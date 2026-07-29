// Root app layout: shell, store orchestration, background syncs for the active instance.
import React, { useCallback, useMemo, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { selectMessengerSidebarActivityCounts } from "~/entities/messenger/messenger-sidebar.lib";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { JitsiActiveCallHost } from "~/features/jitsi-call/jitsi-call-shell.ui";
import { WorkspaceForwardMessageDialog } from "~/features/workspace-forward-message/workspace-forward-message.ui";
import { parseWorkspaceMessengerRoute } from "~/shared/lib/workspace-messenger-route.lib";
import type { StreamEntryInternal } from "~/shared/types/sidebar-chat";
import { useRightDrawerStore } from "~/widgets/right-panel/right-drawer.model";
import { useSearchModalStore } from "~/widgets/search-modal/search-modal.model";
import type { SidebarChat, StreamWithLast } from "~/widgets/sidebar/sidebar.types";
import { getSectionFromPathname } from "~/widgets/top-bar/top-bar.lib";
import { useLayoutAppIconBadge } from "./layout-app-icon-badge.hook";
import { LayoutAppShell } from "./layout-app-shell.ui";
import { LayoutBootstrapErrorBanner } from "./layout-bootstrap-error-banner.ui";
import { shouldRenderChatShell } from "./layout-chat-shell.lib";
import { resolveLayoutConnectionBannerMessage } from "./layout-connection-banner.lib";
import { LayoutConnectionBanner } from "./layout-connection-banner.ui";
import { useConnectionHealthSnapshot } from "./layout-connection-health.hook";
import { useLayoutEscapeNavigation } from "./layout-escape-navigation.hook";
import { useLayoutLastMessengerRoutePersistence } from "./layout-last-messenger-route.hook";
import { LayoutLoadingGate } from "./layout-loading-gate.ui";
import { LayoutNotificationPermissionBanner } from "./layout-notification-permission-banner.ui";
import { shouldEnableLayoutNotificationPermission } from "./layout-notification-permission-ready.lib";
import { useLayoutNotificationPermission } from "./layout-notification-permission.hook";
import { useLayoutOnlineStatus } from "./layout-online-status.hook";
import { useLayoutResetRightDrawerOnInstanceChange } from "./layout-reset-right-drawer-on-instance-change.hook";
import { useLayoutRightPanelShell } from "./layout-right-panel-shell.hook";
import { useLayoutShortcuts } from "./layout-shortcuts.hook";
import { resolveLayoutTopBannerKind } from "./layout-top-banner.lib";
import { useLayoutWindowBranding } from "./layout-window-branding.hook";
import { useLayoutWorkspaceMessengerBootstrap } from "./layout-workspace-messenger-bootstrap.hook";
import { useLayoutWorkspaceNotifications } from "./layout-workspace-notifications.hook";
import { useLayoutWorkspaceRealtime } from "./layout-workspace-realtime.hook";
import { useZulipRateLimitCountdownSeconds } from "./layout-zulip-rate-limit-banner.hook";

const EMPTY_LEGACY_STREAMS: StreamWithLast[] = [];
const EMPTY_LEGACY_DMS: SidebarChat[] = [];
const EMPTY_LEGACY_STREAMS_MAP = new Map<number, StreamEntryInternal>();
const EMPTY_LEGACY_MUTED_STREAM_IDS = new Set<number>();
const EMPTY_USERS_MAP_FOR_RIGHT_DRAWER = new Map<number, { full_name?: string; email?: string }>();

export const Layout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    streamSlug,
    topicName,
    dmId: dmIdParam,
  } = useParams<{
    streamSlug?: string;
    topicName?: string;
    dmId?: string;
  }>();
  const activeStreamSlug = streamSlug ?? undefined;
  const activeTopic = topicName ?? null;

  const workspaceActivityCounts = useMessengerStore(selectMessengerSidebarActivityCounts);
  const bootstrapError = useMessengerStore((state) => state.error);
  const currentUserId = null;
  const streamsFromStore = EMPTY_LEGACY_STREAMS;
  const dmsFromStore = EMPTY_LEGACY_DMS;
  const streamsMap = EMPTY_LEGACY_STREAMS_MAP;
  const usersMapForRightDrawer = EMPTY_USERS_MAP_FOR_RIGHT_DRAWER;
  const mutedStreamIds = EMPTY_LEGACY_MUTED_STREAM_IDS;
  const unreadCountForCurrentInstance = workspaceActivityCounts.inboxCount ?? 0;
  const dmUnreadCountForCurrentInstance = 0;
  const mentionsUnreadCount = workspaceActivityCounts.mentionsCount ?? 0;
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [bootstrapRetryNonce, setBootstrapRetryNonce] = useState(0);
  const rightDrawerOpen = useRightDrawerStore((s) => s.open);
  const setRightDrawerOpen = useRightDrawerStore((s) => s.setOpen);
  const closeRightDrawer = useRightDrawerStore((s) => s.close);
  const rightDrawerMode = useRightDrawerStore((s) => s.mode);
  const rightDrawerUserIdOverride = useRightDrawerStore((s) => s.userIdOverride);
  const rightDrawerWorkspaceUserUuidOverride = useRightDrawerStore(
    (s) => s.workspaceUserUuidOverride,
  );
  const openRightDrawerInfo = useRightDrawerStore((s) => s.openInfo);
  const openRightDrawerUserProfile = useRightDrawerStore((s) => s.openUserProfile);
  const openWorkspaceUserProfile = useRightDrawerStore((s) => s.openWorkspaceUserProfile);
  const openRightDrawerSettings = useRightDrawerStore((s) => s.openSettings);
  const openRightDrawerAbout = useRightDrawerStore((s) => s.openAbout);
  const openRightDrawerBuilds = useRightDrawerStore((s) => s.openBuilds);
  const openRightDrawerPersonalInfo = useRightDrawerStore((s) => s.openPersonalInfo);
  const openRightDrawerUserMenu = useRightDrawerStore((s) => s.openUserMenu);

  const online = useLayoutOnlineStatus();
  const rateLimitSeconds = useZulipRateLimitCountdownSeconds(online);
  const connectionHealth = useConnectionHealthSnapshot();
  const connectionBannerMessage = useMemo(
    () => resolveLayoutConnectionBannerMessage(online, connectionHealth, rateLimitSeconds),
    [connectionHealth, online, rateLimitSeconds],
  );
  const workspaceMessengerRoute = useMemo(
    () => parseWorkspaceMessengerRoute(location.pathname),
    [location.pathname],
  );
  const workspaceMessengerActive = workspaceMessengerRoute != null;
  const workspaceSessions = useWorkspaceAuthStore((state) => state.sessions);
  const currentWorkspaceAccountId = useWorkspaceAuthStore((state) => state.currentAccountId);
  const currentWorkspaceRuntimeContext = useMemo(
    () =>
      selectCurrentWorkspaceRuntimeContext({
        sessions: workspaceSessions,
        currentAccountId: currentWorkspaceAccountId,
      }),
    [currentWorkspaceAccountId, workspaceSessions],
  );
  const workspaceRouteReady =
    workspaceMessengerRoute != null &&
    workspaceMessengerRoute.orgId === currentWorkspaceRuntimeContext?.organizationId &&
    workspaceMessengerRoute.projectId === currentWorkspaceRuntimeContext.projectId;
  const workspaceInstanceId = currentWorkspaceRuntimeContext?.instanceId ?? null;
  useLayoutWorkspaceMessengerBootstrap({ enabled: true, retryNonce: bootstrapRetryNonce });
  useLayoutWorkspaceRealtime({
    enabled: workspaceMessengerActive,
    pathname: location.pathname,
  });

  useLayoutWindowBranding({
    unreadCount: unreadCountForCurrentInstance,
    activeChatWindowTitle: "",
  });

  useLayoutAppIconBadge({
    personalDmUnread: dmUnreadCountForCurrentInstance,
    mentionsUnread: mentionsUnreadCount,
  });

  const openSearch = useSearchModalStore((s) => s.openModal);
  const handleCloseRightDrawer = useCallback(() => {
    closeRightDrawer();
  }, [closeRightDrawer]);

  // Personal-info is a nested account subview: back returns to the account menu, X still closes all.
  const handleBackRightDrawer = useCallback(() => {
    if (rightDrawerMode === "personal-info") {
      openRightDrawerUserMenu();
    }
  }, [openRightDrawerUserMenu, rightDrawerMode]);

  useLayoutResetRightDrawerOnInstanceChange({
    currentInstanceId: workspaceInstanceId,
    closeRightDrawer,
  });

  const showFullscreenLoader = false;
  const showConnectionBlocked = false;

  useLayoutWorkspaceNotifications({
    enabled: workspaceRouteReady,
    navigate,
  });

  const workspaceNotificationScopeKey =
    workspaceRouteReady && currentWorkspaceRuntimeContext != null
      ? workspaceRuntimeOwnerKey(currentWorkspaceRuntimeContext)
      : null;
  const notificationPermissionReady = shouldEnableLayoutNotificationPermission({
    workspaceScopeKey: workspaceNotificationScopeKey,
    workspaceMessengerActive,
  });

  const notificationPermission = useLayoutNotificationPermission({
    enabled: notificationPermissionReady,
    organizationId: workspaceMessengerActive ? workspaceNotificationScopeKey : null,
  });

  useLayoutLastMessengerRoutePersistence(workspaceInstanceId);

  const activeSection = getSectionFromPathname(location.pathname);
  const shouldShowChatShell = shouldRenderChatShell(location.pathname, activeSection);
  useLayoutShortcuts({
    enabled: shouldShowChatShell,
    activeSection,
    rightDrawerOpen,
    setRightDrawerOpen,
    setSidebarOpen,
    sidebarChats: [],
    activeStreamSlug: activeStreamSlug ?? null,
    activeDmIdParam: dmIdParam ?? null,
    navigate,
  });

  useLayoutEscapeNavigation({
    enabled: shouldShowChatShell,
    pathname: location.pathname,
    navigate,
  });

  const {
    rightDrawerTitle,
    rightPanelTitleResolved,
    participantsCount,
    onlineCount,
    workspaceRightPanelInfo,
  } = useLayoutRightPanelShell({
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
    mutedStreamIds,
    usersMapForRightDrawer,
    workspaceRoute: workspaceMessengerRoute,
  });

  const handleRetryBootstrap = useCallback(() => {
    setBootstrapRetryNonce((value) => value + 1);
  }, []);
  const topBannerKind = useMemo(
    () => resolveLayoutTopBannerKind(connectionBannerMessage, notificationPermission.visible),
    [connectionBannerMessage, notificationPermission.visible],
  );

  return (
    <div className="relative flex h-screen max-h-[100dvh] min-h-app-shell w-full min-w-app-shell-min flex-col overflow-hidden bg-bg text-text-primary">
      {topBannerKind === "connection" ? (
        <LayoutConnectionBanner
          online={online}
          health={connectionHealth}
          rateLimitSeconds={rateLimitSeconds}
        />
      ) : null}
      <LayoutBootstrapErrorBanner
        error={shouldShowChatShell ? bootstrapError : null}
        onRetry={handleRetryBootstrap}
      />
      {topBannerKind === "notification-permission" ? (
        <LayoutNotificationPermissionBanner
          enabling={notificationPermission.enabling}
          onEnable={notificationPermission.enable}
          onDismiss={notificationPermission.dismiss}
        />
      ) : null}
      <JitsiActiveCallHost />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <LayoutLoadingGate
          showFullscreenLoader={showFullscreenLoader}
          showConnectionBlocked={showConnectionBlocked}
        >
          <LayoutAppShell
            openSearch={openSearch}
            rightDrawerOpen={rightDrawerOpen}
            setRightDrawerOpen={setRightDrawerOpen}
            openRightDrawerInfo={openRightDrawerInfo}
            openRightDrawerUserProfile={openRightDrawerUserProfile}
            openWorkspaceUserProfile={openWorkspaceUserProfile}
            shouldShowChatShell={shouldShowChatShell}
            pathname={location.pathname}
            sidebarOpen={sidebarOpen}
            rightDrawerMode={rightDrawerMode}
            onCloseRightDrawer={handleCloseRightDrawer}
            onBackRightDrawer={
              rightDrawerMode === "personal-info" ? handleBackRightDrawer : undefined
            }
            rightDrawerTitle={rightDrawerTitle}
            rightPanelTitle={rightPanelTitleResolved}
            participantsCount={participantsCount}
            onlineCount={onlineCount}
            workspaceRightPanelInfo={workspaceRightPanelInfo}
            onOpenSettingsDrawer={openRightDrawerSettings}
            onOpenAboutDrawer={openRightDrawerAbout}
            onOpenBuildsDrawer={openRightDrawerBuilds}
            onOpenPersonalInfoDrawer={openRightDrawerPersonalInfo}
          />
        </LayoutLoadingGate>
      </div>
      <WorkspaceForwardMessageDialog />
    </div>
  );
};
