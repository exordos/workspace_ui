import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useActivityStore } from "~/entities/activity/activity.model";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useHydrateDrafts } from "~/entities/draft/draft-hydration";
import { useInboxStore } from "~/entities/inbox/inbox.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { isMessageForContext, useCurrentChatMessagesStore } from "~/entities/message/message.model";
import { useUsersStore } from "~/entities/user/user.model";
import {
  type ChatInfoContext,
} from "~/features/chat-info/chat-info.types";
import { getChatInfoNetworkKey } from "~/features/chat-info/chat-info.lib";
import { useChatInfoStore } from "~/features/chat-info/chat-info.model";
import { selectSidebarChatsLoading } from "~/features/folder-sync/folder-sync.selectors";
import { useFolderSyncStore } from "~/features/folder-sync/folder-sync.model";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import { usePinStore } from "~/features/pin-chat/pin-chat.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import { useTypingIndicatorStore } from "~/features/typing-indicator/typing-indicator.model";
import { resolveTypingEventRoute } from "~/features/typing-indicator/typing-event-routing";
import { useUserProfileStore } from "~/features/user-profile/user-profile.model";
import { t } from "~/i18n/i18n";
import { setAuthErrorHandler } from "~/shared/api/client";
import {
  fetchUsers,
  fetchRealmPresence,
  getCurrentUser,
  rawMessageToMockMessage,
  deleteQueue,
  fetchUnreadMessagesCountForCredentials,
  type MockMessage,
  type ZulipRawMessage,
  type ZulipEvent,
} from "~/shared/api/zulip";
import { initAuthGuard } from "~/shared/lib/auth-guard";
import { createLogger } from "~/shared/lib/logger";
import { sortChatsByLastMessage } from "~/shared/lib/chat-sorting";
import { getElectronAPI } from "~/shared/lib/electron";
import { startZulipEventLoop, startZulipEventLoopForCredentials } from "~/shared/lib/event-loop";
import { stripHtml } from "~/shared/lib/html";
import { playNotificationSound } from "~/shared/lib/notification-sound";
import { notificationService } from "~/shared/lib/notifications";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { pushService } from "~/shared/lib/push/push.service";
import {
  buildRouteFromPushNotificationClick,
  buildRouteFromMessage,
  findInstanceIdByRealmUri,
} from "~/shared/lib/push-click";
import { getRoleLabel, parseRole } from "~/shared/lib/roles";
import { useShortcut } from "~/shared/lib/shortcuts";
import { isValidRealmUrl } from "~/shared/lib/validation";
import { createResilientInterval } from "~/shared/lib/visibility";
import { useRightDrawerStore, type RightDrawerMode } from "~/widgets/right-panel/right-drawer.model";
import type { RightPanelUserInfo } from "~/widgets/right-panel/right-panel.types";
import { useSearchModalStore } from "~/widgets/search-modal/search-modal.model";
import {
  parseStreamSlug,
  parseDmSlugToUserIds,
  slugForStream,
  getDmById,
} from "~/widgets/sidebar/sidebar.lib";
import { getSectionFromPathname } from "~/widgets/top-bar/top-bar.lib";
import { runChatListBootstrap } from "./layout-chat-list-bootstrap.lib";
import { shouldRenderChatShell } from "./layout-chat-shell.lib";
import { resolveChatShortcutRoute } from "./layout-chat-shortcuts.lib";
import { LayoutAppShell } from "./layout-app-shell.ui";
import { LayoutLoadingGate } from "./layout-loading-gate.ui";
import { startFolderPolling } from "./layout-folder-polling.lib";
import { useLayoutShortcuts } from "./layout-shortcuts.hook";
import { useLayoutUnreadAndTitle } from "./layout-unread-title.hook";
import {
  buildActiveChatWindowTitle,
  computeInstanceUnreadCount,
  formatWebWindowTitleWithUnreadCount,
} from "./layout-instance-unread.lib";
import {
  buildLayoutNotificationsActions,
  dispatchZulipEvent,
} from "./layout-zulip-event-dispatch.lib";
import { buildRightPanelMedia } from "./layout-media.lib";
import { startInactiveInstanceEventStreams } from "./layout-multi-org-event-streams.lib";
import { startInactiveInstanceUnreadPolling } from "./layout-multi-org-polling.lib";
import { closeReadMessageNotifications } from "./layout-notification-tags.lib";
import {
  formatRightPanelLastSeen,
  formatRightPanelLocalTime,
} from "./layout-right-panel.lib";
import { resolveShortcutPanelToggle } from "./layout-shortcuts.lib";
import { SYSTEM_CHANNELS_FOLDER_ID, SYSTEM_PERSONAL_FOLDER_ID } from "./layout-system-folders.lib";
import { useLayoutAuthErrorHandler } from "./layout-auth-error-handler.hook";
import { useLayoutAuthGuard } from "./layout-auth-guard.hook";
import { useLayoutInstanceBootstrap } from "./layout-instance-bootstrap.hook";
import { useInactiveInstancesBackgroundWork } from "./layout-inactive-instances-background-work.hook";
import { useLayoutOnlineStatus } from "./layout-online-status.hook";
import { useLayoutPushPermission } from "./layout-push-permission.hook";
import { useLayoutPresencePolling } from "./layout-presence-polling.hook";
import { useLayoutPushClickRouting } from "./layout-push-click-routing.hook";
import { useLayoutChatInfoSync } from "./layout-chat-info-sync.hook";
import { useLayoutRightDrawerContext } from "./layout-right-drawer-context.hook";
import { useLayoutRightPanelUser } from "./layout-right-panel-user.hook";
import { useLayoutUserProfileAutoload } from "./layout-user-profile-autoload.hook";
import { useLayoutUserStatusFallback } from "./layout-user-status-fallback.hook";
import { useSyncChatContextFromLocation } from "./layout-sync-chat-context.hook";
import { useLayoutWindowBranding } from "./layout-window-branding.hook";
import { useLayoutZulipEventLoop } from "./layout-zulip-event-loop.hook";

function getSystemFolderLabels() {
  return {
    allChats: t("folder.allChats"),
    personal: t("folder.personal"),
    channels: t("folder.channels"),
  };
}

const layoutFolderSyncLog = createLogger("layout:folderSync");

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
  const folderRailLayout = useSettingsStore((s) => s.folderRailLayout);
  const showSystemFolders = useSettingsStore((s) => s.showSystemFolders);
  const setFolderRailLayout = useSettingsStore((s) => s.setFolderRailLayout);
  const mutedStreamIds = useMuteStore((s) => s.mutedStreamIds);
  const chatsSortedByLastMessage = useMemo(
    () =>
      sortChatsByLastMessage(streamsMap, dmsMap, chatSorting, mutedStreamIds, {
        prioritizePersonalUnread,
        prioritizeUnmutedUnreadChannels,
      }),
    [
      streamsMap,
      dmsMap,
      chatSorting,
      mutedStreamIds,
      prioritizePersonalUnread,
      prioritizeUnmutedUnreadChannels,
    ],
  );
  const { realmIcon: currentInstanceRealmIcon, unreadCount: unreadCountForCurrentInstance, activeChatWindowTitle } =
    useLayoutUnreadAndTitle({
      instances,
      currentInstanceId,
      streams: streamsFromStore,
      dms: dmsFromStore,
      streamsMap,
      activeStreamSlug,
      activeTopic,
      dmIdParam,
    });

  const folders = useFolderSyncStore((s) => s.folders);
  const selectedFolderId = useFolderSyncStore((s) => s.selectedFolderId);
  const selectedFolderChatIds = useFolderSyncStore((s) => s.selectedFolderChatIds);
  const folderItemsByFolderId = useFolderSyncStore((s) => s.folderItemsByFolderId);
  const selectedFolderSidebarChats = useFolderSyncStore((s) => s.selectedFolderSidebarChats);
  const sidebarChatsLoading = useFolderSyncStore(selectSidebarChatsLoading);
  const bootstrapFolderSync = useFolderSyncStore((s) => s.bootstrap);
  const refreshFolderSync = useFolderSyncStore((s) => s.refresh);
  const selectFolderSync = useFolderSyncStore((s) => s.selectFolder);
  const syncFolderSyncSidebarProjection = useFolderSyncStore((s) => s.syncSidebarProjection);
  const syncFolderSyncDerived = useFolderSyncStore((s) => s.syncDerived);
  const [pinReorderMode, setPinReorderMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const rightDrawerOpen = useRightDrawerStore((s) => s.open);
  const setRightDrawerOpen = useRightDrawerStore((s) => s.setOpen);
  const rightDrawerMode = useRightDrawerStore((s) => s.mode);
  const rightDrawerUserIdOverride = useRightDrawerStore((s) => s.userIdOverride);
  const openRightDrawerUserProfile = useRightDrawerStore((s) => s.openUserProfile);
  const openRightDrawerSettings = useRightDrawerStore((s) => s.openSettings);
  const openRightDrawerAbout = useRightDrawerStore((s) => s.openAbout);
  const [currentUserStatus, setCurrentUserStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const folderSyncConfigRef = useRef({
    showSystemFolders,
    labels: getSystemFolderLabels(),
  });

  const { loadMuteSnapshot } = useLayoutInstanceBootstrap({
    currentInstanceId,
    currentUserStatus,
  });

  const loadBootstrapMessages = useCallback(async () => {
    return runChatListBootstrap(currentInstanceId);
  }, [currentInstanceId]);

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
  });

  useInactiveInstancesBackgroundWork({
    instances,
    currentInstanceId,
    enabled: currentUserStatus === "ready",
    online,
    setUnreadCount: setInstanceUnreadCount,
  });

  useEffect(() => {
    folderSyncConfigRef.current = {
      showSystemFolders,
      labels: getSystemFolderLabels(),
    };
  }, [showSystemFolders, language]);

  useEffect(() => {
    const rows: {
      folderUuid: string;
      folderItemUuid: string;
      chatId: string;
      orderIndex: number;
      pinnedAt: string | null;
    }[] = [];
    for (const [folderUuid, items] of folderItemsByFolderId) {
      for (const item of items) {
        rows.push({
          folderUuid,
          folderItemUuid: item.uuid,
          chatId: item.chatId,
          orderIndex: item.orderIndex,
          pinnedAt: item.pinnedAt,
        });
      }
    }
    usePinStore.getState().setFromServer(rows);
  }, [folderItemsByFolderId]);

  useEffect(() => {
    // Триггерим пересчет проекции sidebar в orchestrator при изменении входных данных.
    layoutFolderSyncLog.debug("sidebarProjectionEffect", {
      chatsSortedLength: chatsSortedByLastMessage.length,
      streamsMapSize: streamsMap.size,
      dmsMapSize: dmsMap.size,
      selectedFolderId,
      selectedFolderChatIds:
        selectedFolderChatIds === null
          ? "null"
          : selectedFolderChatIds.size === 0
            ? "empty"
            : `size:${selectedFolderChatIds.size}`,
    });
    syncFolderSyncSidebarProjection({
      chatsSortedByLastMessage,
      streamsMap,
      usersMapForChatInfo,
      currentUserId,
    });
  }, [
    chatsSortedByLastMessage,
    currentUserId,
    folderItemsByFolderId,
    selectedFolderChatIds,
    selectedFolderId,
    streamsMap,
    syncFolderSyncSidebarProjection,
    usersMapForChatInfo,
  ]);

  const openSearch = useSearchModalStore((s) => s.openModal);
  const handleSelectFolder = useCallback(
    (folderId: string) => {
      setPinReorderMode(false);
      void selectFolderSync(folderId);
    },
    [selectFolderSync],
  );
  const handleToggleFolderRailLayout = useCallback(() => {
    setFolderRailLayout(folderRailLayout === "horizontal" ? "vertical" : "horizontal");
  }, [folderRailLayout, setFolderRailLayout]);
  const handleStartOrderPinning = useCallback(
    (folderId: string) => {
      void selectFolderSync(folderId);
      setPinReorderMode(true);
    },
    [selectFolderSync],
  );
  const handleExitPinReorderMode = useCallback(() => setPinReorderMode(false), []);
  const previousSelectedFolderIdRef = useRef(selectedFolderId);
  useEffect(() => {
    if (previousSelectedFolderIdRef.current === selectedFolderId) {
      return;
    }
    previousSelectedFolderIdRef.current = selectedFolderId;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) {
        setPinReorderMode(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedFolderId]);
  const handleFoldersChanged = useCallback(async () => {
    await refreshFolderSync("mutation");
  }, [refreshFolderSync]);
  const handleCloseRightDrawer = useCallback(() => {
    setRightDrawerOpen(false);
  }, [setRightDrawerOpen]);

  useLayoutZulipEventLoop({
    currentInstanceId,
    loadBootstrapMessages,
    loadMuteSnapshot,
    setFromMessages,
    setCurrentUserId,
    setCurrentUserStatus,
  });

  // Allow main shell while auth/history sync runs if sidebar was hydrated from IndexedDB.
  const showFullscreenLoader =
    currentInstanceId != null &&
    (currentUserStatus === "loading" || currentUserStatus === "idle") &&
    !chatListHasCachedRows;
  const showError = currentInstanceId != null && currentUserStatus === "error";

  // Redirect legacy URL /stream/general without stream_id to the first channel slug if data is available
  useEffect(() => {
    if (!activeStreamSlug || streamsFromStore.length === 0) return;
    const parsed = parseStreamSlug(activeStreamSlug);
    if (parsed.stream_id != null) return;
    const first = streamsFromStore[0];
    if (first) {
      void navigate(withCurrentOrgRoute(`/stream/${slugForStream(first)}`), { replace: true });
    }
  }, [activeStreamSlug, streamsFromStore, navigate]);

  useEffect(() => {
    if (!currentInstanceId || currentUserStatus !== "ready") return;
    const { showSystemFolders, labels } = folderSyncConfigRef.current;
    void bootstrapFolderSync({
      instanceId: currentInstanceId,
      showSystemFolders,
      labels,
    });
  }, [currentInstanceId, currentUserStatus, bootstrapFolderSync]);

  useEffect(() => {
    syncFolderSyncDerived(showSystemFolders, getSystemFolderLabels());
  }, [language, showSystemFolders, syncFolderSyncDerived]);

  useEffect(() => {
    return startFolderPolling({
      enabled: currentInstanceId != null && currentUserStatus === "ready" && online,
      refreshFolders: () => refreshFolderSync("polling"),
      runImmediately: false,
    });
  }, [currentInstanceId, currentUserStatus, online, refreshFolderSync]);

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

  const allFolderId = useMemo(
    () => folders.find((folder) => folder.systemType === "all")?.id ?? null,
    [folders],
  );
  const pinFolderIdForSelection = useMemo(() => {
    if (
      selectedFolderId === SYSTEM_PERSONAL_FOLDER_ID ||
      selectedFolderId === SYSTEM_CHANNELS_FOLDER_ID
    ) {
      return allFolderId ?? undefined;
    }
    return selectedFolderId;
  }, [allFolderId, selectedFolderId]);

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

  const parsedStream = activeStreamSlug ? parseStreamSlug(activeStreamSlug) : null;
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

  // Собираем топики активного стрима из chat-list store (без сети).
  const chatInfoTopics = useMemo(() => {
    if (activeStreamId == null) return [];
    return Array.from(streamsMap.get(activeStreamId)?.topics.values() ?? []).map((topic) => ({
      name: topic.subject,
      unreadCount: topic.unreadCount,
    }));
  }, [activeStreamId, streamsMap]);

  const { chatInfoData } = useLayoutChatInfoSync({
    currentInstanceId,
    dmChat,
    dmParticipantIds,
    activeStreamId,
    activeStreamName,
    mutedStreamIds,
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
      .filter((userId) => Number.isFinite(userId) && userId > 0);
  }, [chatInfoData, rightDrawerOpen]);

  useLayoutUserStatusFallback({
    enabled: currentUserStatus === "ready",
    currentUserId,
    partnerUserId,
    rightDrawerOpen,
    rightDrawerTargetUserId,
    rightPanelMemberStatusIds,
  });

  const rightPanelTitleResolved =
    rightDrawerMode === "settings"
      ? t("settings.settings")
      : rightDrawerMode === "user-menu"
        ? t("nav.profile")
        : rightDrawerMode === "about"
          ? t("settings.appVersion")
          : rightDrawerTitle;

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
        participantsCount={chatInfoData?.memberCount ?? 0}
        onlineCount={chatInfoData?.onlineCount ?? 0}
        rightPanelUser={rightPanelUser ?? undefined}
        onSelectCommonGroup={(slug: string) => handleSelectDm(slug)}
        onOpenSettingsDrawer={openRightDrawerSettings}
        onOpenAboutDrawer={openRightDrawerAbout}
      />
    </LayoutLoadingGate>
  );
};
