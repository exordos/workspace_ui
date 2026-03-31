import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, useLocation, Outlet } from "react-router-dom";
import { useActivityStore } from "~/entities/activity";
import { useChatListStore } from "~/entities/chat-list";
import { useHydrateDrafts } from "~/entities/draft";
import { useInboxStore } from "~/entities/inbox";
import { useInstancesStore } from "~/entities/instance";
import { useCurrentChatMessagesStore, isMessageForContext } from "~/entities/message";
import { requestUserStatus, selectUserStatusSnapshot, useUsersStore } from "~/entities/user";
import {
  getChatInfoNetworkKey,
  useChatInfoStore,
  type ChatInfoContext,
} from "~/features/chat-info";
import { selectSidebarChatsLoading, useFolderSyncStore } from "~/features/folder-sync";
import { InstanceSwitcher } from "~/features/instance-switch";
import { MediaViewerOverlay } from "~/features/media-viewer";
import { useMuteStore } from "~/features/mute-chat";
import { usePinStore } from "~/features/pin-chat";
import { useSettingsStore } from "~/features/settings";
import { useTypingIndicatorStore, resolveTypingEventRoute } from "~/features/typing-indicator";
import { useUserProfileStore } from "~/features/user-profile";
import { t } from "~/i18n";
import { setAuthErrorHandler } from "~/shared/api/client";
import {
  fetchMessagesAfterAnchor,
  fetchMessagesBeforeAnchor,
  fetchRecentMessages,
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
import { OpenSearchContext } from "~/shared/contexts/open-search";
import { RightDrawerContext } from "~/shared/contexts/right-drawer";
import { initAuthGuard } from "~/shared/lib/auth-guard";
import { brand } from "~/shared/lib/brand";
import { sortChatsByLastMessage } from "~/shared/lib/chat-sorting";
import { getElectronAPI } from "~/shared/lib/electron";
import { startZulipEventLoop, startZulipEventLoopForCredentials } from "~/shared/lib/event-loop";
import { stripHtml } from "~/shared/lib/html";
import { playNotificationSound } from "~/shared/lib/notification-sound";
import { notificationService } from "~/shared/lib/notifications";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { pushService } from "~/shared/lib/push";
import {
  buildRouteFromPushNotificationClick,
  buildRouteFromMessage,
  findInstanceIdByRealmUri,
} from "~/shared/lib/push-click";
import { getRoleLabel, parseRole } from "~/shared/lib/roles";
import { useShortcut } from "~/shared/lib/shortcuts";
import { isValidRealmUrl } from "~/shared/lib/validation";
import { createResilientInterval } from "~/shared/lib/visibility";
import {
  RightDrawer,
  RightPanel,
  useRightDrawerStore,
  type RightDrawerMode,
  type RightPanelUserInfo,
} from "~/widgets/right-panel";
import { SearchModal } from "~/widgets/search-modal";
import {
  SidebarShell,
  parseStreamSlug,
  parseDmSlugToUserIds,
  slugForStream,
  getDmById,
} from "~/widgets/sidebar";
import { TopBar, type TopBarSection } from "~/widgets/top-bar";
import { getSectionFromPathname } from "./layout-active-section.lib";
import { getNewestMessageId, loadDeepHistoryMessages } from "./layout-chat-history-sync.lib";
import { shouldRenderChatShell } from "./layout-chat-shell.lib";
import { resolveChatShortcutRoute } from "./layout-chat-shortcuts.lib";
import { DESKTOP_MIN_VIEWPORT_STYLE } from "./layout-desktop-viewport.lib";
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
  buildRightPanelCommonGroups,
  buildRightPanelUserInfo,
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
import { useLayoutSearchModal } from "./layout-search-modal.hook";
import { useLayoutPushPermission } from "./layout-push-permission.hook";
import { useLayoutPresencePolling } from "./layout-presence-polling.hook";
import { useLayoutPushClickRouting } from "./layout-push-click-routing.hook";
import { useSyncChatContextFromLocation } from "./layout-sync-chat-context.hook";
import { useLayoutWindowBranding } from "./layout-window-branding.hook";
import { useLayoutZulipEventLoop } from "./layout-zulip-event-loop.hook";

const CHAT_HISTORY_BATCH_SIZE = 5000;
const CHAT_HISTORY_MAX_BATCHES = 5;
const RECONNECT_DELTA_BATCH_SIZE = 5000;

function getSystemFolderLabels() {
  return {
    allChats: t("folder.allChats"),
    personal: t("folder.personal"),
    channels: t("folder.channels"),
  };
}

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
  const openRightDrawerUserMenu = useRightDrawerStore((s) => s.openUserMenu);
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
    const initialMessages = await fetchRecentMessages();
    return loadDeepHistoryMessages({
      initialMessages,
      fetchOlderMessages: (anchorId, numBefore) => fetchMessagesBeforeAnchor(anchorId, numBefore),
      pageSize: CHAT_HISTORY_BATCH_SIZE,
      maxBatches: CHAT_HISTORY_MAX_BATCHES,
    });
  }, []);

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

  const {
    open: searchOpen,
    setOpen: setSearchOpen,
    openSearch,
    onSelectMessage: handleSearchSelectMessage,
    onSelectUser: handleSearchSelectUser,
  } = useLayoutSearchModal({ navigate });
  const handleOpenProfile = useCallback(() => {
    openRightDrawerUserMenu();
  }, [openRightDrawerUserMenu]);
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

  const showFullscreenLoader =
    currentInstanceId != null && (currentUserStatus === "loading" || currentUserStatus === "idle");
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

  // Search modal callbacks are provided by useLayoutSearchModal()
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

  const handleSectionChange = useCallback(
    (section: TopBarSection) => {
      if (section === "chat") {
        const first = streamsFromStore[0];
        void navigate(
          first ? withCurrentOrgRoute(`/stream/${slugForStream(first)}`) : withCurrentOrgRoute("/"),
        );
      } else {
        void navigate(withCurrentOrgRoute(`/${section}`));
      }
    },
    [streamsFromStore, navigate],
  );

  const parsedStream = activeStreamSlug ? parseStreamSlug(activeStreamSlug) : null;
  const activeStreamId = parsedStream?.stream_id ?? null;
  const activeStreamName =
    activeStreamId != null
      ? (streamsMap.get(activeStreamId)?.name ?? parsedStream?.stream_name ?? "")
      : parsedStream?.stream_name;
  const dmChat =
    dmIdParam != null && dmIdParam !== "" ? getDmById(dmIdParam, dmsFromStore) : undefined;
  const isGroupDm = dmChat?.isGroup === true;
  const partnerUserId = dmChat && !dmChat.isGroup ? dmChat.id : undefined;
  const rightDrawerOverrideUser = useUsersStore((s) =>
    rightDrawerUserIdOverride != null ? s.getUser(rightDrawerUserIdOverride) : undefined,
  );
  const rightDrawerOverrideUserName = rightDrawerOverrideUser?.full_name?.trim();
  const rightDrawerTitle =
    rightDrawerUserIdOverride != null
      ? rightDrawerOverrideUserName != null && rightDrawerOverrideUserName.length > 0
        ? rightDrawerOverrideUserName
        : `User #${rightDrawerUserIdOverride}`
      : dmIdParam != null && dmIdParam !== ""
        ? isGroupDm
          ? (dmChat?.name?.trim() ?? "") || t("dm.groupChat")
          : t("dm.privateChat")
        : activeStreamName
          ? `#${activeStreamName}`
          : t("chat.generalChat");
  const rightDrawerTargetUserId = rightDrawerUserIdOverride ?? partnerUserId;
  const dmParticipantIds = useMemo(() => {
    if (!dmChat) return [];
    if (dmChat.userIds != null && dmChat.userIds.length > 0) {
      return dmChat.userIds;
    }
    const parsedUserIds = parseDmSlugToUserIds(dmChat.slug);
    if (dmChat.isGroup && currentUserId != null) {
      return Array.from(new Set([...parsedUserIds, currentUserId]));
    }
    return parsedUserIds;
  }, [dmChat, currentUserId]);

  useEffect(() => {
    if (
      rightDrawerMode === "settings" ||
      rightDrawerMode === "user-menu" ||
      rightDrawerMode === "about" ||
      !rightDrawerTargetUserId ||
      !rightDrawerOpen
    ) {
      useUserProfileStore.getState().clear();
      return;
    }

    void useUserProfileStore.getState().loadProfile(rightDrawerTargetUserId);
    return () => {
      useUserProfileStore.getState().clear();
    };
  }, [currentInstanceId, rightDrawerMode, rightDrawerTargetUserId, rightDrawerOpen]);

  const userFromStore = useUsersStore((s) =>
    rightDrawerTargetUserId != null ? s.getUser(rightDrawerTargetUserId) : undefined,
  );
  const detailedProfile = useUserProfileStore((s) => s.profile);
  const currentChatMessages = useCurrentChatMessagesStore((s) => s.messages);
  const rightPanelMedia = useMemo(
    () => (rightDrawerTargetUserId != null ? buildRightPanelMedia(currentChatMessages) : undefined),
    [rightDrawerTargetUserId, currentChatMessages],
  );
  const rightPanelCommonGroups = useMemo(() => {
    if (rightDrawerTargetUserId == null) return undefined;
    const groups = buildRightPanelCommonGroups(dmsFromStore, rightDrawerTargetUserId, dmChat?.slug);
    return groups.length > 0 ? groups : undefined;
  }, [rightDrawerTargetUserId, dmsFromStore, dmChat?.slug]);
  const userStatusLabel = selectUserStatusSnapshot(userFromStore).statusLabel;
  const currentInstanceRealm = useMemo(
    () => instances.find((instance) => instance.id === currentInstanceId)?.realm,
    [instances, currentInstanceId],
  );
  const rightPanelUser = useMemo<RightPanelUserInfo | undefined>(() => {
    return buildRightPanelUserInfo({
      userFromStore:
        userFromStore == null
          ? undefined
          : {
              ...userFromStore,
              avatar_url: userFromStore.avatar_url ?? undefined,
            },
      detailedProfile: detailedProfile ?? undefined,
      dmChat,
      rightDrawerTargetUserId: rightDrawerTargetUserId ?? null,
      userStatusLabel,
      currentInstanceRealm,
      media: rightPanelMedia,
      commonGroups: rightPanelCommonGroups,
    });
  }, [
    userFromStore,
    detailedProfile,
    dmChat,
    rightDrawerTargetUserId,
    userStatusLabel,
    currentInstanceRealm,
    rightPanelMedia,
    rightPanelCommonGroups,
  ]);

  // Собираем топики активного стрима из chat-list store (без сети).
  const chatInfoTopics = useMemo(() => {
    if (activeStreamId == null) return [];
    return Array.from(streamsMap.get(activeStreamId)?.topics.values() ?? []).map((topic) => ({
      name: topic.subject,
      unreadCount: topic.unreadCount,
    }));
  }, [activeStreamId, streamsMap]);

  // Единый контекст chat-info для none/dm/stream веток.
  const chatInfoContext = useMemo<ChatInfoContext>(() => {
    if (!currentInstanceId) {
      return { kind: "none", instanceId: null };
    }
    if (dmChat) {
      return {
        kind: "dm",
        instanceId: currentInstanceId,
        dmName: dmChat.name,
        participantIds: dmParticipantIds,
      };
    }
    if (activeStreamId != null) {
      return {
        kind: "stream",
        instanceId: currentInstanceId,
        streamId: activeStreamId,
        streamName: activeStreamName ?? "",
        isMuted: mutedStreamIds.has(activeStreamId),
        topics: chatInfoTopics,
      };
    }
    return { kind: "none", instanceId: currentInstanceId };
  }, [
    activeStreamId,
    activeStreamName,
    chatInfoTopics,
    currentInstanceId,
    dmChat,
    dmParticipantIds,
    mutedStreamIds,
  ]);
  // Стабильный ключ контекста нужен для контроля частоты hydrate.
  const chatInfoNetworkKey = useMemo(
    () => getChatInfoNetworkKey(chatInfoContext),
    [chatInfoContext],
  );
  const hydratedChatInfoKeyRef = useRef<string | null>(null);

  // Сетевой hydrate запускаем только при смене ключа контекста.
  useEffect(() => {
    if (hydratedChatInfoKeyRef.current === chatInfoNetworkKey) {
      return;
    }
    hydratedChatInfoKeyRef.current = chatInfoNetworkKey;
    void useChatInfoStore.getState().hydrate(chatInfoContext);
  }, [chatInfoContext, chatInfoNetworkKey]);

  // Локальный derived-пересчет (topics/mute/presence) без HTTP.
  useEffect(() => {
    useChatInfoStore.getState().syncDerived(chatInfoContext);
  }, [chatInfoContext, usersMapForChatInfo]);

  const chatInfoData = useChatInfoStore((s) => s.data);
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

  useEffect(() => {
    if (currentUserStatus !== "ready" || currentUserId == null) {
      return;
    }
    // Точечный fallback для текущего пользователя (верхняя панель).
    void requestUserStatus(currentUserId, {
      reason: "top_bar",
      priority: "high",
    });
  }, [currentUserId, currentUserStatus]);

  useEffect(() => {
    if (currentUserStatus !== "ready" || partnerUserId == null) {
      return;
    }
    // Точечный fallback для собеседника в активном DM.
    void requestUserStatus(partnerUserId, {
      reason: "dm_header",
      priority: "high",
    });
  }, [currentUserStatus, partnerUserId]);

  useEffect(() => {
    if (currentUserStatus !== "ready" || !rightDrawerOpen || rightDrawerTargetUserId == null) {
      return;
    }
    // Точечный fallback для карточки пользователя в right panel.
    void requestUserStatus(rightDrawerTargetUserId, {
      reason: "right_panel",
      priority: "high",
    });
  }, [currentUserStatus, rightDrawerOpen, rightDrawerTargetUserId]);

  useEffect(() => {
    if (currentUserStatus !== "ready" || !rightDrawerOpen) {
      return;
    }
    // Фоновый fallback для списка участников справа (ограниченный список).
    for (const userId of rightPanelMemberStatusIds) {
      void requestUserStatus(userId, {
        reason: "right_panel",
        priority: "low",
      });
    }
  }, [currentUserStatus, rightDrawerOpen, rightPanelMemberStatusIds]);

  if (showFullscreenLoader) {
    return (
      <div
        className="flex h-screen max-h-[100dvh] min-h-[400px] items-center justify-center bg-bg text-text-primary"
        style={DESKTOP_MIN_VIEWPORT_STYLE}
      >
        <p className="text-sm text-text-muted">{t("app.loading")}</p>
      </div>
    );
  }

  if (showError) {
    return (
      <div
        className="flex h-screen max-h-[100dvh] min-h-[400px] items-center justify-center bg-bg text-text-primary"
        style={DESKTOP_MIN_VIEWPORT_STYLE}
      >
        <p className="text-sm text-text-muted">{t("app.pageLoadError")}</p>
      </div>
    );
  }

  return (
    <OpenSearchContext.Provider value={openSearch}>
      <RightDrawerContext.Provider
        value={{
          open: rightDrawerOpen,
          setOpen: setRightDrawerOpen,
          openUserProfile: openRightDrawerUserProfile,
        }}
      >
        <div
          className="flex h-screen max-h-[100dvh] min-h-[400px] flex-col items-stretch overflow-hidden bg-bg text-text-primary"
          role="application"
          aria-label={brand.appName}
          style={DESKTOP_MIN_VIEWPORT_STYLE}
        >
          {!online && (
            <div className="bg-notice-base/90 text-badge-text shrink-0 py-1 text-center text-xs">
              {t("app.offline")}
            </div>
          )}
          <MediaViewerOverlay />
          <SearchModal
            open={searchOpen}
            onOpenChange={setSearchOpen}
            onSelectMessage={handleSearchSelectMessage}
            onSelectUser={handleSearchSelectUser}
          />
          <TopBar
            activeSection={activeSection}
            onSectionChange={handleSectionChange}
            onOpenSearch={openSearch}
            onOpenProfile={handleOpenProfile}
            leftContent={<InstanceSwitcher />}
          />
          <div className="flex min-h-0 flex-1 items-stretch justify-center">
            <div className="flex min-h-0 w-full min-w-0 max-w-[1920px] gap-1">
              {shouldShowChatShell && sidebarOpen && (
                <>
                  <SidebarShell />
                </>
              )}
              <main
                className="flex min-h-0 min-w-0 flex-1 items-stretch justify-start overflow-hidden"
                data-focus-zone="main"
                role="main"
                aria-label={t("nav.messenger")}
              >
                <Outlet />
              </main>
              {rightDrawerOpen &&
                (rightDrawerMode === "settings" ||
                  rightDrawerMode === "user-menu" ||
                  rightDrawerMode === "about" ||
                  shouldShowChatShell) && (
                  <RightDrawer onClose={handleCloseRightDrawer}>
                    <RightPanel
                      mode={rightDrawerMode}
                      title={
                        rightDrawerMode === "settings"
                          ? t("settings.settings")
                          : rightDrawerMode === "user-menu"
                            ? t("nav.profile")
                            : rightDrawerMode === "about"
                              ? t("settings.appVersion")
                              : rightDrawerTitle
                      }
                      participantsCount={chatInfoData?.memberCount ?? 0}
                      onlineCount={chatInfoData?.onlineCount ?? 0}
                      user={rightPanelUser}
                      onSelectCommonGroup={(slug) => handleSelectDm(slug)}
                      onOpenSettingsDrawer={openRightDrawerSettings}
                      onOpenAboutDrawer={openRightDrawerAbout}
                    />
                  </RightDrawer>
                )}
            </div>
          </div>
        </div>
      </RightDrawerContext.Provider>
    </OpenSearchContext.Provider>
  );
};
