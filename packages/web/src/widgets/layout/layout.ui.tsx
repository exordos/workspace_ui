// Root app layout: shell, store orchestration, background syncs for the active instance.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { enrichSidebarChatsWithMentionFlags } from "~/entities/chat-list/chat-list-sidebar-mention-enrich.lib";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useHydrateDrafts } from "~/entities/draft/draft-hydration";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { syncUnreadSurfacesFromDelta } from "~/entities/unread-sync/unread-surfaces-sync.lib";
import { useUsersStore } from "~/entities/user/user.model";
import { useFolderSyncStore } from "~/features/folder-sync/folder-sync.model";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import { sortChatsByLastMessage } from "~/shared/lib/chat-sorting";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { useRightDrawerStore } from "~/widgets/right-panel/right-drawer.model";
import { useSearchModalStore } from "~/widgets/search-modal/search-modal.model";
import { getSectionFromPathname } from "~/widgets/top-bar/top-bar.lib";
import { useLayoutAppIconBadge } from "./layout-app-icon-badge.hook";
import { LayoutAppShell } from "./layout-app-shell.ui";
import { useLayoutAuthErrorHandler } from "./layout-auth-error-handler.hook";
import { useLayoutAuthGuard } from "./layout-auth-guard.hook";
import { LayoutBootstrapErrorBanner } from "./layout-bootstrap-error-banner.ui";
import { runChatListBootstrap } from "./layout-chat-list-bootstrap.lib";
import { useLayoutChatListSnapshotSync } from "./layout-chat-list-snapshot-sync.hook";
import { parseFocusedMessageIdFromSearch } from "./layout-chat-route.lib";
import { shouldRenderChatShell } from "./layout-chat-shell.lib";
import { LayoutConnectionBanner } from "./layout-connection-banner.ui";
import { useConnectionHealthSnapshot } from "./layout-connection-health.hook";
import { useLayoutConnectionRecovery } from "./layout-connection-recovery.hook";
import { useLayoutEscapeNavigation } from "./layout-escape-navigation.hook";
import { useLayoutFolderSyncOrchestration } from "./layout-folder-sync-orchestration.hook";
import { useInactiveInstancesBackgroundWork } from "./layout-inactive-instances-background-work.hook";
import { useLayoutInstanceBootstrap } from "./layout-instance-bootstrap.hook";
import {
  computeInstanceDmUnreadCount,
  hasPersonalUnreadIndicator,
} from "./layout-instance-unread.lib";
import { useLayoutLastMessengerRoutePersistence } from "./layout-last-messenger-route.hook";
import { LayoutLoadingGate } from "./layout-loading-gate.ui";
import { useLayoutMentionsSyncPolling } from "./layout-mentions-sync-polling.hook";
import { useLayoutMuteSnapshotSync } from "./layout-mute-snapshot-sync.hook";
import { LayoutNotificationPermissionBanner } from "./layout-notification-permission-banner.ui";
import { useLayoutNotificationPermission } from "./layout-notification-permission.hook";
import { useLayoutOnlineStatus } from "./layout-online-status.hook";
import { useLayoutPresencePolling } from "./layout-presence-polling.hook";
import { useLayoutPushClickRouting } from "./layout-push-click-routing.hook";
import { useLayoutPushNotifications } from "./layout-push-notifications.hook";
import { useLayoutPushPermission } from "./layout-push-permission.hook";
import { useLayoutResetRightDrawerOnInstanceChange } from "./layout-reset-right-drawer-on-instance-change.hook";
import { useLayoutRightPanelShell } from "./layout-right-panel-shell.hook";
import { useLayoutShortcuts } from "./layout-shortcuts.hook";
import { useSyncChatContextFromLocation } from "./layout-sync-chat-context.hook";
import { useLayoutUnreadAndTitle } from "./layout-unread-title.hook";
import { isLayoutUserConnectionReady } from "./layout-user-connection-status.types";
import { useLayoutWindowBranding } from "./layout-window-branding.hook";
import { useLayoutZulipEventLoop } from "./layout-zulip-event-loop.hook";
import { useZulipRateLimitCountdownSeconds } from "./layout-zulip-rate-limit-banner.hook";
import type { LayoutUserConnectionStatus } from "./layout-user-connection-status.types";

export const Layout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const instances = useInstancesStore((s) => s.instances);
  const currentInstanceId = useInstancesStore((s) => s.currentInstanceId);
  const setCurrentInstanceId = useInstancesStore((s) => s.setCurrentInstanceId);
  const setInstanceUnreadCount = useInstancesStore((s) => s.setInstanceUnreadCount);
  const setInstanceDmUnreadCount = useInstancesStore((s) => s.setInstanceDmUnreadCount);
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

  const setFromMessages = useChatListStore((s) => s.setFromMessages);
  const bootstrapError = useChatListStore((s) => s.bootstrapError);
  const clearBootstrapError = useChatListStore((s) => s.clearBootstrapError);
  const setCurrentUserId = useChatListStore((s) => s.setCurrentUserId);
  const currentUserId = useChatListStore((s) => s.currentUserId);
  const streamMetadataHydrated = useChatListStore((s) => s.streamMetadataHydrated);
  const streamsFromStore = useChatListStore((s) => s.streams());
  const dmsFromStore = useChatListStore((s) => s.dms());
  const streamsMap = useChatListStore((s) => s.streamsMap);
  const dmsMap = useChatListStore((s) => s.dmsMap);
  const mentionedUnreadMessageIds = useChatListStore((s) => s.mentionedUnreadMessageIds);
  const messageIdToLocation = useChatListStore((s) => s.messageIdToLocation);
  const chatListHasCachedRows = useMemo(
    () => streamsMap.size > 0 || dmsMap.size > 0,
    [streamsMap, dmsMap],
  );
  const usersMapForChatInfo = useUsersStore((s) => s.users);
  const prioritizePersonalUnread = useSettingsStore((s) => s.prioritizePersonalUnread);
  const prioritizeUnmutedUnreadChannels = useSettingsStore(
    (s) => s.prioritizeUnmutedUnreadChannels,
  );
  const language = useSettingsStore((s) => s.language);
  const showSystemFolders = useSettingsStore((s) => s.showSystemFolders);
  const mutedStreamIds = useMuteStore((s) => s.mutedStreamIds);
  const mutedTopicKeys = useMuteStore((s) => s.mutedTopicKeys);
  const unmutedTopicKeys = useMuteStore((s) => s.unmutedTopicKeys);
  const followedTopicKeys = useMuteStore((s) => s.followedTopicKeys);
  const isStreamMuted = useMuteStore((s) => s.isStreamMuted);
  const isEffectivelyMuted = useMuteStore((s) => s.isEffectivelyMuted);
  const chatsSortedByLastMessage = useMemo(
    () =>
      enrichSidebarChatsWithMentionFlags(
        sortChatsByLastMessage(streamsMap, dmsMap, mutedStreamIds, {
          prioritizePersonalUnread,
          prioritizeUnmutedUnreadChannels,
          hideUnknownArchivedStreams: !streamMetadataHydrated,
          isEffectivelyMuted,
        }),
        mentionedUnreadMessageIds,
        messageIdToLocation,
        currentUserId,
      ),
    [
      streamsMap,
      dmsMap,
      mentionedUnreadMessageIds,
      messageIdToLocation,
      currentUserId,
      mutedStreamIds,
      mutedTopicKeys,
      unmutedTopicKeys,
      followedTopicKeys,
      prioritizePersonalUnread,
      prioritizeUnmutedUnreadChannels,
      streamMetadataHydrated,
      isEffectivelyMuted,
    ],
  );
  const { unreadCount: unreadCountForCurrentInstance, activeChatWindowTitle } =
    useLayoutUnreadAndTitle({
      instances,
      currentInstanceId,
      streams: streamsFromStore,
      dms: dmsFromStore,
      streamsMap,
      activeStreamSlug,
      activeTopic,
      dmIdParam,
      currentUserId,
      isStreamMuted,
      isEffectivelyMuted,
    });

  const dmUnreadCountForCurrentInstance = useMemo(
    () => computeInstanceDmUnreadCount({ dms: dmsFromStore, currentUserId }),
    [dmsFromStore, currentUserId],
  );
  const mentionsUnreadCount = useChatListStore((s) => s.mentionsUnreadCount);
  const personalUnreadIndicatorActive = useMemo(
    () => hasPersonalUnreadIndicator(dmUnreadCountForCurrentInstance, mentionsUnreadCount),
    [dmUnreadCountForCurrentInstance, mentionsUnreadCount],
  );

  const selectedFolderId = useFolderSyncStore((s) => s.selectedFolderId);
  const selectedFolderChatIds = useFolderSyncStore((s) => s.selectedFolderChatIds);
  const folderItemsByFolderId = useFolderSyncStore((s) => s.folderItemsByFolderId);
  const selectedFolderSidebarChats = useFolderSyncStore((s) => s.selectedFolderSidebarChats);
  const bootstrapFolderSync = useFolderSyncStore((s) => s.bootstrap);
  const refreshFolderSync = useFolderSyncStore((s) => s.refresh);
  const syncFolderSyncSidebarProjection = useFolderSyncStore((s) => s.syncSidebarProjection);
  const syncFolderSyncDerived = useFolderSyncStore((s) => s.syncDerived);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const rightDrawerOpen = useRightDrawerStore((s) => s.open);
  const setRightDrawerOpen = useRightDrawerStore((s) => s.setOpen);
  const closeRightDrawer = useRightDrawerStore((s) => s.close);
  const rightDrawerMode = useRightDrawerStore((s) => s.mode);
  const rightDrawerUserIdOverride = useRightDrawerStore((s) => s.userIdOverride);
  const openRightDrawerInfo = useRightDrawerStore((s) => s.openInfo);
  const openRightDrawerUserProfile = useRightDrawerStore((s) => s.openUserProfile);
  const openRightDrawerSettings = useRightDrawerStore((s) => s.openSettings);
  const openRightDrawerAbout = useRightDrawerStore((s) => s.openAbout);
  const [currentUserStatus, setCurrentUserStatus] = useState<LayoutUserConnectionStatus>("idle");
  const refreshStaleRef = useRef<(() => void) | null>(null);
  const latestMessageIdRef = useRef<number | null>(null);

  const { loadMuteSnapshot } = useLayoutInstanceBootstrap({
    currentInstanceId,
    currentUserStatus,
  });

  const loadBootstrapMessages = useCallback(
    async (signal: AbortSignal, isStale: () => boolean) =>
      runChatListBootstrap(currentInstanceId, { signal, isStale }),
    [currentInstanceId],
  );

  const online = useLayoutOnlineStatus();
  const rateLimitSeconds = useZulipRateLimitCountdownSeconds(online);
  const connectionHealth = useConnectionHealthSnapshot();
  useHydrateDrafts(currentInstanceId, currentUserStatus);

  // Safety net: keeps the org badge correct when mute state changes outside event/local flows.
  useEffect(() => {
    if (!currentInstanceId) return;
    syncUnreadSurfacesFromDelta({
      source: "layout-derived",
      instanceId: currentInstanceId,
      isStreamMuted,
      isEffectivelyMuted,
      applyDelta: () => {},
    });
  }, [
    currentInstanceId,
    unreadCountForCurrentInstance,
    personalUnreadIndicatorActive,
    mutedStreamIds,
    mutedTopicKeys,
    unmutedTopicKeys,
    followedTopicKeys,
    isStreamMuted,
    isEffectivelyMuted,
  ]);

  useLayoutWindowBranding({
    unreadCount: unreadCountForCurrentInstance,
    activeChatWindowTitle: activeChatWindowTitle ?? "",
  });

  useLayoutAppIconBadge({
    personalDmUnread: dmUnreadCountForCurrentInstance,
    mentionsUnread: mentionsUnreadCount,
  });

  useLayoutMentionsSyncPolling({
    enabled: isLayoutUserConnectionReady(currentUserStatus),
    currentInstanceId,
  });

  useInactiveInstancesBackgroundWork({
    instances,
    currentInstanceId,
    enabled: isLayoutUserConnectionReady(currentUserStatus),
    online,
    setUnreadCount: setInstanceUnreadCount,
    setDmUnreadCount: setInstanceDmUnreadCount,
  });

  useLayoutFolderSyncOrchestration({
    currentInstanceId,
    currentUserStatus,
    showSystemFolders,
    language,
    folderItemsByFolderId,
    chatsSortedByLastMessage,
    streamsMap,
    dmsMapSize: dmsMap.size,
    usersMapForChatInfo,
    currentUserId,
    hideUnknownArchivedStreams: !streamMetadataHydrated,
    selectedFolderId,
    selectedFolderChatIds,
    bootstrapFolderSync,
    syncFolderSyncSidebarProjection,
    syncFolderSyncDerived,
    refreshFolderSync,
    online,
    isStreamMuted,
  });

  const openSearch = useSearchModalStore((s) => s.openModal);
  const handleCloseRightDrawer = useCallback(() => {
    closeRightDrawer();
  }, [closeRightDrawer]);

  const focusedMessageId = useMemo(
    () => parseFocusedMessageIdFromSearch(location.search),
    [location.search],
  );

  useLayoutConnectionRecovery({
    currentUserStatus,
    currentInstanceId,
    latestMessageIdRef,
    focusedMessageId,
  });

  useLayoutZulipEventLoop({
    currentInstanceId,
    latestMessageIdRef,
    focusedMessageId,
    onRefreshStaleRef: refreshStaleRef,
    loadBootstrapMessages,
    loadMuteSnapshot,
    setFromMessages,
    setCurrentUserId,
    setCurrentUserStatus,
  });

  // Subscribe to persist only after clear/hydrate for the new instanceId —
  // otherwise an empty snapshot overwrites the org key in IDB (see layout-chat-list-snapshot-sync.lib).
  useLayoutChatListSnapshotSync(currentInstanceId);
  useLayoutMuteSnapshotSync(currentInstanceId);
  useLayoutResetRightDrawerOnInstanceChange({ currentInstanceId, closeRightDrawer });

  // Allow main shell while auth/history sync runs if sidebar was hydrated from IndexedDB.
  const showFullscreenLoader =
    currentInstanceId != null &&
    (currentUserStatus === "loading" || currentUserStatus === "idle") &&
    !chatListHasCachedRows;
  const showConnectionBlocked =
    currentInstanceId != null && currentUserStatus === "blocked" && !chatListHasCachedRows;

  useLayoutAuthGuard({ currentInstanceId, currentUserStatus, navigate });
  useLayoutAuthErrorHandler({ currentInstanceId, currentUserStatus, navigate });
  useSyncChatContextFromLocation();

  useLayoutPushPermission({ enabled: isLayoutUserConnectionReady(currentUserStatus) });
  useLayoutPushNotifications({ enabled: isLayoutUserConnectionReady(currentUserStatus) });

  useLayoutPushClickRouting({
    currentInstanceId,
    instances,
    setCurrentInstanceId,
    navigate,
  });

  const layoutConnectionReady =
    currentInstanceId != null && isLayoutUserConnectionReady(currentUserStatus);

  const notificationPermission = useLayoutNotificationPermission({
    enabled: layoutConnectionReady,
    organizationId: currentInstanceId,
  });

  useLayoutPresencePolling({ enabled: layoutConnectionReady });

  const handleSelectDm = useCallback(
    (slug: string | null) => {
      if (slug) {
        void navigate(withCurrentOrgRoute(`/dm/${slug}`));
      } else {
        void navigate(withCurrentOrgRoute("/"));
      }
    },
    [navigate],
  );

  useLayoutLastMessengerRoutePersistence();

  const activeSection = getSectionFromPathname(location.pathname);
  const shouldShowChatShell = shouldRenderChatShell(location.pathname, activeSection);
  useLayoutShortcuts({
    enabled: shouldShowChatShell,
    activeSection,
    rightDrawerOpen,
    setRightDrawerOpen,
    setSidebarOpen,
    sidebarChats: selectedFolderSidebarChats,
    activeStreamSlug: activeStreamSlug ?? null,
    activeDmIdParam: dmIdParam ?? null,
    navigate,
  });

  useLayoutEscapeNavigation({
    enabled: shouldShowChatShell,
    pathname: location.pathname,
    navigate,
  });

  const { rightPanelTitleResolved, participantsCount, onlineCount, rightPanelUser } =
    useLayoutRightPanelShell({
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
    });

  const handleRetryBootstrap = useCallback(() => {
    clearBootstrapError();
    refreshStaleRef.current?.();
  }, [clearBootstrapError]);

  return (
    <div className="flex h-screen max-h-[100dvh] min-h-app-shell w-full min-w-app-shell-min flex-col overflow-hidden bg-bg text-text-primary">
      <LayoutConnectionBanner
        online={online}
        health={connectionHealth}
        rateLimitSeconds={rateLimitSeconds}
      />
      <LayoutBootstrapErrorBanner error={bootstrapError} onRetry={handleRetryBootstrap} />
      {notificationPermission.visible ? (
        <LayoutNotificationPermissionBanner
          enabling={notificationPermission.enabling}
          onEnable={notificationPermission.enable}
          onDismiss={notificationPermission.dismiss}
        />
      ) : null}
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
            shouldShowChatShell={shouldShowChatShell}
            sidebarOpen={sidebarOpen}
            rightDrawerMode={rightDrawerMode}
            onCloseRightDrawer={handleCloseRightDrawer}
            rightPanelTitle={rightPanelTitleResolved}
            participantsCount={participantsCount}
            onlineCount={onlineCount}
            rightPanelUser={rightPanelUser}
            onSelectCommonGroup={(slug: string) => handleSelectDm(slug)}
            onOpenSettingsDrawer={openRightDrawerSettings}
            onOpenAboutDrawer={openRightDrawerAbout}
          />
        </LayoutLoadingGate>
      </div>
    </div>
  );
};
