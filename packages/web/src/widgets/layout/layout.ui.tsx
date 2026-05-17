// Корневой layout приложения: собирает shell, стор-оркестрацию и фоновые синки для активного инстанса.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useHydrateDrafts } from "~/entities/draft/draft-hydration";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useUsersStore } from "~/entities/user/user.model";
import { useFolderSyncStore } from "~/features/folder-sync/folder-sync.model";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import { sortChatsByLastMessage } from "~/shared/lib/chat-sorting";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { useRightDrawerStore } from "~/widgets/right-panel/right-drawer.model";
import { useSearchModalStore } from "~/widgets/search-modal/search-modal.model";
import { getSectionFromPathname } from "~/widgets/top-bar/top-bar.lib";
import { LayoutAppShell } from "./layout-app-shell.ui";
import { useLayoutAuthErrorHandler } from "./layout-auth-error-handler.hook";
import { useLayoutAuthGuard } from "./layout-auth-guard.hook";
import { runChatListBootstrap } from "./layout-chat-list-bootstrap.lib";
import { useLayoutChatListSnapshotSync } from "./layout-chat-list-snapshot-sync.hook";
import { shouldRenderChatShell } from "./layout-chat-shell.lib";
import { useLayoutFolderSyncOrchestration } from "./layout-folder-sync-orchestration.hook";
import { useInactiveInstancesBackgroundWork } from "./layout-inactive-instances-background-work.hook";
import { useLayoutInstanceBootstrap } from "./layout-instance-bootstrap.hook";
import { useLayoutLastMessengerRoutePersistence } from "./layout-last-messenger-route.hook";
import { useLayoutLegacyStreamSlugRedirect } from "./layout-legacy-stream-redirect.hook";
import { LayoutLoadingGate } from "./layout-loading-gate.ui";
import { useLayoutMuteSnapshotSync } from "./layout-mute-snapshot-sync.hook";
import { useLayoutOnlineStatus } from "./layout-online-status.hook";
import { useLayoutPresencePolling } from "./layout-presence-polling.hook";
import { useLayoutPushClickRouting } from "./layout-push-click-routing.hook";
import { useLayoutPushPermission } from "./layout-push-permission.hook";
import { useLayoutResetRightDrawerOnInstanceChange } from "./layout-reset-right-drawer-on-instance-change.hook";
import { useLayoutRightPanelShell } from "./layout-right-panel-shell.hook";
import { useLayoutShortcuts } from "./layout-shortcuts.hook";
import { useSyncChatContextFromLocation } from "./layout-sync-chat-context.hook";
import { useLayoutUnreadAndTitle } from "./layout-unread-title.hook";
import { useLayoutWindowBranding } from "./layout-window-branding.hook";
import { useLayoutZulipEventLoop } from "./layout-zulip-event-loop.hook";

export const Layout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const instances = useInstancesStore((s) => s.instances);
  const currentInstanceId = useInstancesStore((s) => s.currentInstanceId);
  const setCurrentInstanceId = useInstancesStore((s) => s.setCurrentInstanceId);
  const setInstanceUnreadCount = useInstancesStore((s) => s.setInstanceUnreadCount);
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
  const setCurrentUserId = useChatListStore((s) => s.setCurrentUserId);
  const currentUserId = useChatListStore((s) => s.currentUserId);
  const streamMetadataHydrated = useChatListStore((s) => s.streamMetadataHydrated);
  const streamsFromStore = useChatListStore((s) => s.streams());
  const dmsFromStore = useChatListStore((s) => s.dms());
  const streamsMap = useChatListStore((s) => s.streamsMap);
  const dmsMap = useChatListStore((s) => s.dmsMap);
  const chatListHasCachedRows = useMemo(
    () => streamsMap.size > 0 || dmsMap.size > 0,
    [streamsMap, dmsMap],
  );
  const usersMapForChatInfo = useUsersStore((s) => s.users);
  const chatSorting = useSettingsStore((s) => s.chatSorting);
  const prioritizePersonalUnread = useSettingsStore((s) => s.prioritizePersonalUnread);
  const prioritizeUnmutedUnreadChannels = useSettingsStore(
    (s) => s.prioritizeUnmutedUnreadChannels,
  );
  const language = useSettingsStore((s) => s.language);
  const showSystemFolders = useSettingsStore((s) => s.showSystemFolders);
  const mutedStreamIds = useMuteStore((s) => s.mutedStreamIds);
  const chatsSortedByLastMessage = useMemo(
    () =>
      sortChatsByLastMessage(streamsMap, dmsMap, chatSorting, mutedStreamIds, {
        prioritizePersonalUnread,
        prioritizeUnmutedUnreadChannels,
        hideUnknownArchivedStreams: !streamMetadataHydrated,
      }),
    [
      streamsMap,
      dmsMap,
      chatSorting,
      mutedStreamIds,
      prioritizePersonalUnread,
      prioritizeUnmutedUnreadChannels,
      streamMetadataHydrated,
    ],
  );
  const {
    realmIcon: currentInstanceRealmIcon,
    unreadCount: unreadCountForCurrentInstance,
    activeChatWindowTitle,
  } = useLayoutUnreadAndTitle({
    instances,
    currentInstanceId,
    streams: streamsFromStore,
    dms: dmsFromStore,
    streamsMap,
    activeStreamSlug,
    activeTopic,
    dmIdParam,
    currentUserId,
  });

  const currentInstanceRealmBaseUrl = useMemo(
    () => instances.find((instance) => instance.id === currentInstanceId)?.realm,
    [instances, currentInstanceId],
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
  const openRightDrawerUserProfile = useRightDrawerStore((s) => s.openUserProfile);
  const openRightDrawerSettings = useRightDrawerStore((s) => s.openSettings);
  const openRightDrawerAbout = useRightDrawerStore((s) => s.openAbout);
  const [currentUserStatus, setCurrentUserStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");

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
  useHydrateDrafts(currentInstanceId, currentUserStatus);

  useEffect(() => {
    if (!currentInstanceId) return;
    setInstanceUnreadCount(currentInstanceId, unreadCountForCurrentInstance);
  }, [currentInstanceId, unreadCountForCurrentInstance, setInstanceUnreadCount]);

  useLayoutWindowBranding({
    unreadCount: unreadCountForCurrentInstance,
    activeChatWindowTitle: activeChatWindowTitle ?? "",
    realmIcon: currentInstanceRealmIcon,
    realmBaseUrl: currentInstanceRealmBaseUrl,
  });

  useInactiveInstancesBackgroundWork({
    instances,
    currentInstanceId,
    enabled: currentUserStatus === "ready",
    online,
    setUnreadCount: setInstanceUnreadCount,
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
  });

  const openSearch = useSearchModalStore((s) => s.openModal);
  const handleCloseRightDrawer = useCallback(() => {
    closeRightDrawer();
  }, [closeRightDrawer]);

  useLayoutZulipEventLoop({
    currentInstanceId,
    loadBootstrapMessages,
    loadMuteSnapshot,
    setFromMessages,
    setCurrentUserId,
    setCurrentUserStatus,
  });

  // После zulip: clear/hydrate для нового instanceId уже отработали — не подписываемся на persist раньше,
  // иначе в IDB уйдёт пустой снимок под ключ новой организации (см. layout-chat-list-snapshot-sync.lib).
  useLayoutChatListSnapshotSync(currentInstanceId);
  useLayoutMuteSnapshotSync(currentInstanceId);
  useLayoutResetRightDrawerOnInstanceChange({ currentInstanceId, closeRightDrawer });

  // Allow main shell while auth/history sync runs if sidebar was hydrated from IndexedDB.
  const showFullscreenLoader =
    currentInstanceId != null &&
    (currentUserStatus === "loading" || currentUserStatus === "idle") &&
    !chatListHasCachedRows;
  const showError = currentInstanceId != null && currentUserStatus === "error";

  useLayoutLegacyStreamSlugRedirect({
    activeStreamSlug,
    streamsFromStore,
    navigate,
  });

  useLayoutAuthGuard({ currentInstanceId, currentUserStatus, navigate });
  useLayoutAuthErrorHandler({ currentInstanceId, currentUserStatus, navigate });
  useSyncChatContextFromLocation();

  useLayoutPushPermission({ enabled: currentUserStatus === "ready" });

  useLayoutPushClickRouting({
    currentInstanceId,
    instances,
    setCurrentInstanceId,
    navigate,
  });

  useLayoutPresencePolling({
    enabled: currentInstanceId != null && currentUserStatus === "ready",
  });

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

  return (
    <LayoutLoadingGate showFullscreenLoader={showFullscreenLoader} showError={showError}>
      <LayoutAppShell
        openSearch={openSearch}
        online={online}
        rightDrawerOpen={rightDrawerOpen}
        setRightDrawerOpen={setRightDrawerOpen}
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
  );
};
