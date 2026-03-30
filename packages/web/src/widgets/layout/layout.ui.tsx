import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, useLocation, Outlet } from "react-router-dom";
import { useActivityStore } from "~/entities/activity";
import { useChatListStore } from "~/entities/chat-list";
import { useHydrateDrafts } from "~/entities/draft";
import { useInboxStore } from "~/entities/inbox";
import { useInstancesStore } from "~/entities/instance";
import { useCurrentChatMessagesStore, isMessageForContext } from "~/entities/message";
import { ensureUserStatusLoaded, formatUserStatusLabel, useUsersStore } from "~/entities/user";
import { useChatInfoStore } from "~/features/chat-info";
import { InstanceSwitcher } from "~/features/instance-switch";
import { useMuteStore } from "~/features/mute-chat";
import { usePinStore } from "~/features/pin-chat";
import { useSettingsStore } from "~/features/settings";
import { useTypingIndicatorStore, resolveTypingEventRoute } from "~/features/typing-indicator";
import { useUserProfileStore } from "~/features/user-profile";
import { t } from "~/i18n";
import { setAuthErrorHandler } from "~/shared/api/client";
import {
  getFolders,
  getFolderItems,
  mapWorkspaceFoldersToRail,
  type FolderItemForClient,
  type WorkspaceFolderForRail,
} from "~/shared/api/workspace-client";
import {
  fetchMessagesAfterAnchor,
  fetchMessagesBeforeAnchor,
  fetchRecentMessages,
  rawMessageToMockMessage,
} from "~/shared/api/zulip-messages";
import {
  deleteQueue,
  fetchUnreadMessagesCountForCredentials,
  fetchUserTopics,
} from "~/shared/api/zulip-queue";
import {
  fetchStreamMembers,
  fetchStreams,
  fetchSubscriptions,
} from "~/shared/api/zulip-streams";
import type { MockMessage, ZulipEvent, ZulipRawMessage } from "~/shared/api/zulip.types";
import {
  fetchRealmPresence,
  fetchUsers,
  getCurrentUser,
} from "~/shared/api/zulip-users";
import { OpenSearchContext } from "~/shared/contexts/open-search";
import { RightDrawerContext } from "~/shared/contexts/right-drawer";
import { initAuthGuard } from "~/shared/lib/auth-guard";
import { brand } from "~/shared/lib/brand";
import { sortChatsByLastMessage } from "~/shared/lib/chat-sorting";
import { getElectronAPI } from "~/shared/lib/electron";
import { startZulipEventLoop, startZulipEventLoopForCredentials } from "~/shared/lib/event-loop";
import { stripHtml } from "~/shared/lib/html";
import { isOnline, onStatusChange } from "~/shared/lib/network";
import { playNotificationSound } from "~/shared/lib/notification-sound";
import { notificationService } from "~/shared/lib/notifications";
import { loadOfflineFolders, saveOfflineFolders } from "~/shared/lib/offline-folders";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { syncOrganizationFavicon } from "~/shared/lib/organization-branding";
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
import { FolderRail } from "~/widgets/folder-rail";
import { RightDrawer } from "~/widgets/right-panel";
import { RightPanel, type RightPanelUserInfo } from "~/widgets/right-panel";
import { SearchModal } from "~/widgets/search-modal";
import {
  Sidebar,
  parseStreamSlug,
  parseDmSlugToUserIds,
  slugForStream,
  getDmById,
  chatToWorkspaceChatId,
} from "~/widgets/sidebar";
import { TopBar, type TopBarSection } from "~/widgets/top-bar";
import { getSectionFromPathname } from "./layout-active-section.lib";
import { getNewestMessageId, loadDeepHistoryMessages } from "./layout-chat-history-sync.lib";
import {
  buildDmChatInfoData,
  buildStreamChatInfoData,
  hasChatInfoContext,
} from "./layout-chat-info.lib";
import { shouldRenderChatShell } from "./layout-chat-shell.lib";
import { resolveChatShortcutRoute } from "./layout-chat-shortcuts.lib";
import { DESKTOP_MIN_VIEWPORT_STYLE } from "./layout-desktop-viewport.lib";
import { startFolderPolling } from "./layout-folder-polling.lib";
import {
  resolveSelectedFolderId,
  shouldLoadFolderItemsForSelection,
} from "./layout-folder-selection.lib";
import {
  buildActiveChatWindowTitle,
  computeInstanceUnreadCount,
  formatWebWindowTitleWithUnreadCount,
} from "./layout-instance-unread.lib";
import { buildRightPanelMedia } from "./layout-media.lib";
import { startInactiveInstanceEventStreams } from "./layout-multi-org-event-streams.lib";
import { startInactiveInstanceUnreadPolling } from "./layout-multi-org-polling.lib";
import { closeReadMessageNotifications } from "./layout-notification-tags.lib";
import {
  buildRightPanelCommonGroups,
  formatRightPanelLastSeen,
  formatRightPanelLocalTime,
} from "./layout-right-panel.lib";
import { resolveShortcutPanelToggle } from "./layout-shortcuts.lib";
import {
  SYSTEM_CHANNELS_FOLDER_ID,
  SYSTEM_PERSONAL_FOLDER_ID,
  withDefaultSystemFolders,
} from "./layout-folders-default.lib";
import { LayoutMediaViewerOverlay } from "./layout-media-viewer-overlay.ui";

const CHAT_HISTORY_BATCH_SIZE = 5000;
const CHAT_HISTORY_MAX_BATCHES = 5;
const RECONNECT_DELTA_BATCH_SIZE = 5000;

export const Layout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const instances = useInstancesStore((s) => s.instances);
  const currentInstanceId = useInstancesStore((s) => s.currentInstanceId);
  const setCurrentInstanceId = useInstancesStore((s) => s.setCurrentInstanceId);
  const setInstanceUnreadCount = useInstancesStore((s) => s.setInstanceUnreadCount);
  const currentInstanceRealmIcon = useMemo(
    () => instances.find((instance) => instance.id === currentInstanceId)?.realmIcon,
    [instances, currentInstanceId],
  );
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
  const chatSorting = useSettingsStore((s) => s.chatSorting);
  const prioritizePersonalUnread = useSettingsStore((s) => s.prioritizePersonalUnread);
  const prioritizeUnmutedUnreadChannels = useSettingsStore(
    (s) => s.prioritizeUnmutedUnreadChannels,
  );
  const language = useSettingsStore((s) => s.language);
  const folderRailLayout = useSettingsStore((s) => s.folderRailLayout);
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
  const unreadCountForCurrentInstance = useMemo(
    () =>
      computeInstanceUnreadCount({
        streams: streamsFromStore,
        dms: dmsFromStore,
      }),
    [streamsFromStore, dmsFromStore],
  );
  const activeStreamNameForTitle = useMemo(() => {
    if (!activeStreamSlug) return null;
    const parsedActiveStream = parseStreamSlug(activeStreamSlug);
    if (parsedActiveStream.stream_id != null) {
      return streamsMap.get(parsedActiveStream.stream_id)?.name ?? parsedActiveStream.stream_name;
    }
    return parsedActiveStream.stream_name;
  }, [activeStreamSlug, streamsMap]);
  const activeDmChatForTitle = useMemo(
    () => (dmIdParam != null && dmIdParam !== "" ? getDmById(dmIdParam, dmsFromStore) : undefined),
    [dmIdParam, dmsFromStore],
  );
  const activeChatWindowTitle = useMemo(
    () =>
      buildActiveChatWindowTitle({
        dmName: activeDmChatForTitle?.name,
        streamName: activeStreamNameForTitle,
        topicName: activeTopic,
      }),
    [activeDmChatForTitle?.name, activeStreamNameForTitle, activeTopic],
  );

  const [folders, setFolders] = useState<WorkspaceFolderForRail[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState("1");
  const [pinReorderMode, setPinReorderMode] = useState(false);
  const [folderChatIds, setFolderChatIds] = useState<Set<string> | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);
  const [rightDrawerMode, setRightDrawerMode] = useState<
    "info" | "settings" | "user-menu" | "about"
  >("info");
  const [rightDrawerUserIdOverride, setRightDrawerUserIdOverride] = useState<number | null>(null);
  const [currentUserStatus, setCurrentUserStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const eventLoopAbortRef = useRef<AbortController | null>(null);
  const queueIdRef = useRef<string | null>(null);
  const instanceAtLoopStartRef = useRef<{ realm: string; email: string; apiKey: string } | null>(
    null,
  );
  const latestMessageIdRef = useRef<number | null>(null);

  const loadMuteSnapshot = useCallback(async () => {
    const [subs, userTopics] = await Promise.all([fetchSubscriptions(), fetchUserTopics()]);
    const mutedStreamIds = subs.filter((s) => s.is_muted).map((s) => s.stream_id);
    const mutedTopics: { streamId: number; topic: string }[] = [];
    const unmutedTopics: { streamId: number; topic: string }[] = [];
    for (const ut of userTopics) {
      if (ut.visibility_policy === 1) {
        mutedTopics.push({ streamId: ut.stream_id, topic: ut.topic_name });
      } else if (ut.visibility_policy === 2) {
        unmutedTopics.push({ streamId: ut.stream_id, topic: ut.topic_name });
      }
    }
    return { mutedStreamIds, mutedTopics, unmutedTopics };
  }, []);

  const loadBootstrapMessages = useCallback(async () => {
    const initialMessages = await fetchRecentMessages();
    return loadDeepHistoryMessages({
      initialMessages,
      fetchOlderMessages: (anchorId, numBefore) => fetchMessagesBeforeAnchor(anchorId, numBefore),
      pageSize: CHAT_HISTORY_BATCH_SIZE,
      maxBatches: CHAT_HISTORY_MAX_BATCHES,
    });
  }, []);

  const [online, setOnline] = useState(isOnline());
  useEffect(() => onStatusChange(setOnline), []);
  useHydrateDrafts(currentInstanceId, currentUserStatus);

  useEffect(() => {
    if (!currentInstanceId) return;
    setInstanceUnreadCount(currentInstanceId, unreadCountForCurrentInstance);
  }, [currentInstanceId, unreadCountForCurrentInstance, setInstanceUnreadCount]);

  useEffect(() => {
    if (getElectronAPI() != null) return;
    document.title = formatWebWindowTitleWithUnreadCount(
      unreadCountForCurrentInstance,
      brand.appName,
      activeChatWindowTitle,
    );
  }, [unreadCountForCurrentInstance, activeChatWindowTitle]);

  useEffect(() => {
    if (getElectronAPI() != null) return;
    return syncOrganizationFavicon(currentInstanceRealmIcon);
  }, [currentInstanceRealmIcon]);

  useEffect(() => {
    return startInactiveInstanceEventStreams({
      instances,
      currentInstanceId,
      enabled: currentUserStatus === "ready",
      online,
      refreshUnreadForInstance: async (instance) => {
        const unreadCount = await fetchUnreadMessagesCountForCredentials({
          realm: instance.realm,
          email: instance.email,
          apiKey: instance.apiKey,
        });
        if (unreadCount != null) {
          setInstanceUnreadCount(instance.id, unreadCount);
        }
      },
      startEventLoop: ({ credentials, onEvent, onBadQueue, onReconnect }) => {
        const controller = new AbortController();
        let queueId: string | null = null;
        let stopped = false;
        startZulipEventLoopForCredentials({
          credentials,
          signal: controller.signal,
          onEvent,
          onBadQueue,
          onReconnect,
          eventTypes: [
            "message",
            "update_message_flags",
            "delete_message",
            "subscription",
            "user_topic",
          ],
          onQueueRegistered: (id) => {
            if (stopped) {
              deleteQueue(id, credentials).catch(() => {});
              return;
            }
            queueId = id;
          },
        });
        return () => {
          stopped = true;
          if (queueId) {
            deleteQueue(queueId, credentials).catch(() => {});
          }
          controller.abort();
        };
      },
    });
  }, [instances, currentInstanceId, currentUserStatus, online, setInstanceUnreadCount]);

  useEffect(() => {
    return startInactiveInstanceUnreadPolling({
      instances,
      currentInstanceId,
      enabled: currentUserStatus === "ready",
      online,
      setUnreadCount: setInstanceUnreadCount,
      fetchUnreadCount: (instance, signal) =>
        fetchUnreadMessagesCountForCredentials(
          {
            realm: instance.realm,
            email: instance.email,
            apiKey: instance.apiKey,
          },
          { signal },
        ),
    });
  }, [instances, currentInstanceId, currentUserStatus, online, setInstanceUnreadCount]);

  useEffect(() => {
    const nextFolderId = resolveSelectedFolderId(folders, selectedFolderId);
    if (nextFolderId == null || nextFolderId === selectedFolderId) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setPinReorderMode(false);
      setSelectedFolderId((currentFolderId) =>
        currentFolderId === nextFolderId ? currentFolderId : nextFolderId,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [folders, selectedFolderId]);

  useEffect(() => {
    let cancelled = false;
    if (!shouldLoadFolderItemsForSelection(folders, selectedFolderId)) {
      void Promise.resolve().then(() => {
        if (!cancelled) setFolderChatIds(null);
      });
      return () => {
        cancelled = true;
      };
    }
    getFolderItems(selectedFolderId)
      .then((items) => {
        if (!cancelled) setFolderChatIds(new Set(items.map((i) => i.chatId)));
      })
      .catch(() => {
        if (!cancelled) setFolderChatIds(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedFolderId, folders]);

  const openSearch = React.useCallback(() => setSearchOpen(true), []);
  const handleOpenProfile = useCallback(() => {
    setRightDrawerMode("user-menu");
    setRightDrawerUserIdOverride(null);
    setRightDrawerOpen(true);
  }, []);
  const handleSelectFolder = useCallback((folderId: string) => {
    setPinReorderMode(false);
    setSelectedFolderId(folderId);
  }, []);
  const handleToggleFolderRailLayout = useCallback(() => {
    setFolderRailLayout(folderRailLayout === "horizontal" ? "vertical" : "horizontal");
  }, [folderRailLayout, setFolderRailLayout]);
  const handleStartOrderPinning = useCallback((folderId: string) => {
    setSelectedFolderId(folderId);
    setPinReorderMode(true);
  }, []);
  const handleExitPinReorderMode = useCallback(() => setPinReorderMode(false), []);
  const handleFoldersChanged = useCallback(() => {
    if (!currentInstanceId) return;
    getFolders()
      .then(async (f) => {
        const foldersWithSystemDefaults = withDefaultSystemFolders(mapWorkspaceFoldersToRail(f));
        setFolders(foldersWithSystemDefaults);
        saveOfflineFolders(currentInstanceId, foldersWithSystemDefaults);

        const allFolderItems: FolderItemForClient[] = [];
        await Promise.all(
          f.map(async (folder) => {
            try {
              const items = await getFolderItems(folder.uuid);
              allFolderItems.push(...items);
            } catch {
              /* folder items fetch is best-effort */
            }
          }),
        );

        usePinStore.getState().setFromServer(
          allFolderItems.map((item) => ({
            folderUuid: item.folderUuid,
            folderItemUuid: item.uuid,
            chatId: item.chatId,
            orderIndex: item.orderIndex,
            pinnedAt: item.pinnedAt,
          })),
        );
      })
      .catch(() => {
        setFolders(withDefaultSystemFolders(loadOfflineFolders(currentInstanceId)));
      });
  }, [currentInstanceId]);
  const handleSetRightDrawerOpen = useCallback((open: boolean) => {
    setRightDrawerOpen(open);
    if (!open) {
      setRightDrawerMode("info");
      setRightDrawerUserIdOverride(null);
    }
  }, []);
  const handleOpenRightDrawerUserProfile = useCallback((userId: number) => {
    setRightDrawerMode("info");
    setRightDrawerUserIdOverride(userId);
    setRightDrawerOpen(true);
  }, []);
  const handleOpenSettingsDrawer = useCallback(() => {
    setRightDrawerMode("settings");
    setRightDrawerUserIdOverride(null);
    setRightDrawerOpen(true);
  }, []);
  const handleOpenAboutDrawer = useCallback(() => {
    setRightDrawerMode("about");
    setRightDrawerUserIdOverride(null);
    setRightDrawerOpen(true);
  }, []);
  const handleCloseRightDrawer = useCallback(() => {
    handleSetRightDrawerOpen(false);
  }, [handleSetRightDrawerOpen]);

  // Current user is a prerequisite for the UI; users and messages load in parallel
  useEffect(() => {
    if (!currentInstanceId) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) setCurrentUserStatus("loading");
    });
    useUsersStore.getState().clear();
    useChatListStore.getState().clear();
    useActivityStore.getState().clear();
    useCurrentChatMessagesStore.getState().setContext(null);
    useCurrentChatMessagesStore.getState().setMessages([]);
    latestMessageIdRef.current = null;

    const pUsers = fetchUsers();
    const pMessages = loadBootstrapMessages();

    getCurrentUser()
      .then((user) => {
        if (cancelled) return;
        if (user?.user_id != null) {
          useUsersStore.getState().mergeUser(user);
          setCurrentUserId(user.user_id);
          setCurrentUserStatus("ready");
        } else {
          setCurrentUserStatus("error");
          useUsersStore.getState().clear();
          useChatListStore.getState().clear();
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCurrentUserStatus("error");
          useUsersStore.getState().clear();
          useChatListStore.getState().clear();
        }
      });

    Promise.all([pUsers, pMessages])
      .then(([members, messages]) => {
        if (cancelled) return;
        const msgs = messages ?? [];
        useUsersStore.getState().mergeUsers(members ?? []);
        for (const m of msgs) {
          useUsersStore.getState().mergeFromMessage(m);
        }
        const uid = useChatListStore.getState().currentUserId ?? null;
        setFromMessages(msgs, uid);
        latestMessageIdRef.current = getNewestMessageId(msgs);

        eventLoopAbortRef.current?.abort();
        eventLoopAbortRef.current = new AbortController();
        queueIdRef.current = null;
        const inst = useInstancesStore.getState().getCurrentInstance();
        instanceAtLoopStartRef.current = inst
          ? { realm: inst.realm, email: inst.email, apiKey: inst.apiKey }
          : null;

        const refreshStaleData = () => {
          if (cancelled) return;
          const uid = useChatListStore.getState().currentUserId ?? null;
          const hydrateFromRecentWindow = () => {
            fetchRecentMessages()
              .then((freshMsgs) => {
                if (cancelled) return;
                for (const m of freshMsgs) {
                  useUsersStore.getState().mergeFromMessage(m);
                }
                setFromMessages(freshMsgs, uid);
                latestMessageIdRef.current = getNewestMessageId(freshMsgs);
              })
              .catch(() => {});
          };

          const latestMessageId = latestMessageIdRef.current;
          if (latestMessageId == null) {
            hydrateFromRecentWindow();
          } else {
            fetchMessagesAfterAnchor(latestMessageId, RECONNECT_DELTA_BATCH_SIZE)
              .then((deltaMessages) => {
                if (cancelled) return;
                if (deltaMessages.length === 0) return;

                const usersStore = useUsersStore.getState();
                const chatListStore = useChatListStore.getState();
                for (const message of deltaMessages) {
                  usersStore.mergeFromMessage(message);
                  chatListStore.addMessage(message);
                }

                latestMessageIdRef.current =
                  getNewestMessageId(deltaMessages) ?? latestMessageIdRef.current;
                useActivityStore.getState().markStale();
                useInboxStore.getState().markStale();
              })
              .catch(() => {
                hydrateFromRecentWindow();
              });
          }

          fetchRealmPresence()
            .then((data) => {
              if (cancelled || data.result === "error" || !data.presences) return;
              const store = useUsersStore.getState();
              for (const [email, entry] of Object.entries(data.presences)) {
                const agg = entry.aggregated ?? entry.website;
                if (agg?.status != null && agg?.timestamp != null) {
                  store.setPresenceByEmail(email, {
                    status: agg.status === "idle" ? "idle" : "active",
                    timestamp: agg.timestamp,
                  });
                }
              }
            })
            .catch(() => {});
        };

        startZulipEventLoop({
          signal: eventLoopAbortRef.current.signal,
          onReconnect: refreshStaleData,
          onBadQueue: refreshStaleData,
          onQueueRegistered: (id) => {
            queueIdRef.current = id;
            void loadMuteSnapshot()
              .then((snapshot) => {
                if (!cancelled) {
                  useMuteStore.getState().setFromServer(snapshot);
                }
              })
              .catch(() => {});
          },
          onEvent(event: ZulipEvent) {
            const chatList = useChatListStore.getState();
            const currentChat = useCurrentChatMessagesStore.getState();
            const currentUserId = chatList.currentUserId;

            if (event.type === "message" && event.message) {
              const raw = event.message as unknown as ZulipRawMessage;
              useUsersStore.getState().mergeFromMessage(raw);
              chatList.addMessage(raw);
              if (latestMessageIdRef.current == null || raw.id > latestMessageIdRef.current) {
                latestMessageIdRef.current = raw.id;
              }
              useActivityStore.getState().markStale();
              const isForCurrentChat =
                currentChat.context && isMessageForContext(raw, currentChat.context, currentUserId);
              if (isForCurrentChat) {
                currentChat.appendMessage(rawMessageToMockMessage(raw));
              }

              useInboxStore.getState().markStale();

              const isFromSelf = raw.sender_id === currentUserId;
              if (!isFromSelf && !isForCurrentChat) {
                let isMuted = false;
                if (raw.type === "stream" && raw.stream_id != null) {
                  const topic = (raw.subject ?? "").trim() || "general";
                  isMuted = useMuteStore.getState().isEffectivelyMuted(raw.stream_id, topic);
                }

                if (!isMuted) {
                  const senderName = raw.sender_full_name ?? "New message";
                  const contentPreview = stripHtml(raw.content ?? "").slice(0, 100);
                  notificationService
                    .show({
                      title: senderName,
                      body: contentPreview,
                      tag: `msg-${raw.id}`,
                    })
                    .catch(() => {});

                  const soundPreset = useSettingsStore.getState().notificationSound;
                  if (soundPreset !== "none") {
                    playNotificationSound(soundPreset);
                  }

                  if (typeof document !== "undefined" && !document.hasFocus()) {
                    getElectronAPI()?.os?.requestAttention?.();
                  }
                }
              }
            } else if (event.type === "update_message_flags") {
              const op = event.op as "add" | "remove";
              const flag = event.flag as string;
              const messageIds = (event.messages ?? []) as number[];
              if (messageIds.length === 0) return;
              useActivityStore.getState().markStale();
              if (flag === "read") {
                useInboxStore.getState().markStale();
                if (op === "add") {
                  closeReadMessageNotifications(notificationService.closeByTag, messageIds);
                  chatList.decrementUnreadForMessages(messageIds);
                  currentChat.updateMessageFlags(messageIds, "read", "add");
                } else {
                  chatList.incrementUnreadForMessages(messageIds);
                  currentChat.updateMessageFlags(messageIds, "read", "remove");
                }
              }
            } else if (event.type === "reaction") {
              useActivityStore.getState().markStale();
              const messageId = event.message_id as number;
              const reaction =
                event.emoji_name != null
                  ? {
                      emoji_name: event.emoji_name as string,
                      emoji_code: (event.emoji_code as string) ?? "",
                      reaction_type:
                        (event.reaction_type as
                          | "unicode_emoji"
                          | "realm_emoji"
                          | "zulip_extra_emoji") ?? "unicode_emoji",
                      user_id: event.user_id as number,
                    }
                  : null;
              if (reaction) {
                const op = (event.op as "add" | "remove") ?? "add";
                currentChat.updateMessageReaction(messageId, reaction, op);
              }
            } else if (event.type === "delete_message") {
              useActivityStore.getState().markStale();
              const messageIds = event.message_ids
                ? (event.message_ids as number[])
                : event.message_id != null
                  ? [event.message_id as number]
                  : [];
              if (messageIds.length > 0) {
                chatList.handleDeleteMessages(messageIds);
                currentChat.removeMessages(messageIds);
              }
            } else if (event.type === "typing") {
              const sender = event.sender as { user_id: number } | undefined;
              const recipients = event.recipients as { user_id: number }[] | undefined;
              const currentUserId = useChatListStore.getState().currentUserId;
              const route = resolveTypingEventRoute({
                op: event.op as string | undefined,
                messageType: event.message_type as string | undefined,
                senderUserId: sender?.user_id,
                recipients,
                streamId: event.stream_id as number | undefined,
                topic: event.topic as string | undefined,
                currentUserId,
              });
              if (route) {
                useTypingIndicatorStore
                  .getState()
                  .setTyping(route.chatKey, route.userId, route.isTyping);
              }
            } else if (event.type === "update_message") {
              useActivityStore.getState().markStale();
              const messageId = event.message_id as number | undefined;
              const newContent = event.rendered_content as string | undefined;
              if (messageId != null && newContent != null) {
                currentChat.updateMessageContent(messageId, newContent);
              }
            } else if (event.type === "presence") {
              const email = event.email as string | undefined;
              const presenceData = event.presence as
                | Record<string, { status?: string; timestamp?: number }>
                | undefined;
              if (email && presenceData) {
                const agg = presenceData.aggregated ?? presenceData.website;
                if (agg?.status != null && agg?.timestamp != null) {
                  useUsersStore.getState().setPresenceByEmail(email, {
                    status: agg.status === "idle" ? "idle" : "active",
                    timestamp: agg.timestamp,
                  });
                }
              }
            } else if (event.type === "user_status") {
              const userId = event.user_id as number | undefined;
              if (userId != null) {
                const statusText =
                  typeof event.status_text === "string" ? event.status_text.trim() : "";
                const emojiName =
                  typeof event.emoji_name === "string" ? event.emoji_name.trim() : "";
                const emojiCode =
                  typeof event.emoji_code === "string" ? event.emoji_code.trim() : "";
                const reactionTypeRaw =
                  typeof event.reaction_type === "string" ? event.reaction_type : undefined;
                const reactionType =
                  reactionTypeRaw === "unicode_emoji" ||
                  reactionTypeRaw === "realm_emoji" ||
                  reactionTypeRaw === "zulip_extra_emoji"
                    ? reactionTypeRaw
                    : undefined;
                const away = event.away === true;
                const hasStatus = statusText.length > 0 || emojiName.length > 0 || away;
                useUsersStore.getState().setStatus(
                  userId,
                  hasStatus
                    ? {
                        text: statusText,
                        emojiName: emojiName || undefined,
                        emojiCode: emojiCode || undefined,
                        reactionType,
                        away,
                      }
                    : null,
                  Date.now(),
                );
              }
            } else if (event.type === "subscription") {
              const op = event.op as
                | "update"
                | "add"
                | "remove"
                | "peer_add"
                | "peer_remove"
                | undefined;
              if (op === "update") {
                const streamId = event.stream_id as number | undefined;
                const property = event.property as string | undefined;
                const value = event.value as boolean | undefined;
                if (streamId != null && property === "is_muted" && value != null) {
                  if (value) {
                    useMuteStore.getState().muteStream(streamId);
                  } else {
                    useMuteStore.getState().unmuteStream(streamId);
                  }
                }
              }
            } else if (event.type === "user_topic") {
              const streamId = event.stream_id as number | undefined;
              const topicName = event.topic_name as string | undefined;
              const visibilityPolicy = event.visibility_policy as number | undefined;
              if (streamId != null && topicName != null && visibilityPolicy != null) {
                const muteStore = useMuteStore.getState();
                if (visibilityPolicy === 1) {
                  muteStore.muteTopic(streamId, topicName);
                } else if (visibilityPolicy === 2) {
                  muteStore.unmuteTopic(streamId, topicName);
                } else {
                  muteStore.unmuteTopic(streamId, topicName);
                }
              }
            }
          },
        });
      })
      .catch(() => {
        if (!cancelled) {
          // Don't reset stores — current user may have already loaded
        }
      });

    return () => {
      cancelled = true;
      const qid = queueIdRef.current;
      const creds = instanceAtLoopStartRef.current;
      if (qid && creds) {
        deleteQueue(qid, creds).catch(() => {});
      }
      eventLoopAbortRef.current?.abort();
      eventLoopAbortRef.current = null;
      queueIdRef.current = null;
      instanceAtLoopStartRef.current = null;
      latestMessageIdRef.current = null;
    };
  }, [
    currentInstanceId,
    loadBootstrapMessages,
    loadMuteSnapshot,
    setFromMessages,
    setCurrentUserId,
  ]);

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
    let cancelled = false;
    const cachedFolders = withDefaultSystemFolders(loadOfflineFolders(currentInstanceId));
    if (cachedFolders.length > 0) {
      void Promise.resolve().then(() => {
        if (!cancelled) setFolders(cachedFolders);
      });
    }
    getFolders()
      .then(async (f) => {
        if (cancelled) return;
        const foldersWithSystemDefaults = withDefaultSystemFolders(mapWorkspaceFoldersToRail(f));
        setFolders(foldersWithSystemDefaults);
        saveOfflineFolders(currentInstanceId, foldersWithSystemDefaults);

        // Hydrate pin store from folder items with pinned metadata + persisted order.
        const allFolderItems: FolderItemForClient[] = [];
        await Promise.all(
          f.map(async (folder) => {
            try {
              const items = await getFolderItems(folder.uuid);
              allFolderItems.push(...items);
            } catch {
              /* folder items fetch is best-effort */
            }
          }),
        );
        if (!cancelled) {
          usePinStore.getState().setFromServer(
            allFolderItems.map((item) => ({
              folderUuid: item.folderUuid,
              folderItemUuid: item.uuid,
              chatId: item.chatId,
              orderIndex: item.orderIndex,
              pinnedAt: item.pinnedAt,
            })),
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFolders(withDefaultSystemFolders(loadOfflineFolders(currentInstanceId)));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentInstanceId, currentUserStatus]);

  useEffect(() => {
    setFolders((currentFolders) => withDefaultSystemFolders(currentFolders));
  }, [language]);

  useEffect(() => {
    return startFolderPolling({
      enabled: currentInstanceId != null && currentUserStatus === "ready" && online,
      refreshFolders: handleFoldersChanged,
      runImmediately: false,
    });
  }, [currentInstanceId, currentUserStatus, online, handleFoldersChanged]);

  // F06: Hydrate mute store from subscription data and user_topics on load
  useEffect(() => {
    if (!currentInstanceId || currentUserStatus !== "ready") return;
    let cancelled = false;

    loadMuteSnapshot()
      .then((snapshot) => {
        if (!cancelled) {
          useMuteStore.getState().setFromServer(snapshot);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [currentInstanceId, currentUserStatus, loadMuteSnapshot]);

  // Session timeout: auto-logout after 24h inactivity when user is authenticated
  useEffect(() => {
    if (!currentInstanceId || currentUserStatus !== "ready") return;
    const cleanup = initAuthGuard({
      onBeforeSessionExpired: () => {
        void pushService.unregister().catch(() => {});
      },
      onSessionExpired: () => {
        void navigate(withCurrentOrgRoute("/login"));
      },
    });
    return cleanup;
  }, [currentInstanceId, currentUserStatus, navigate]);

  // Auth expiry: auto-logout on protected API 401 responses.
  useEffect(() => {
    if (!currentInstanceId || currentUserStatus !== "ready") {
      setAuthErrorHandler(null);
      return;
    }
    setAuthErrorHandler(() => {
      void pushService.unregister().catch(() => {});
      void navigate(withCurrentOrgRoute("/login"));
    });
    return () => {
      setAuthErrorHandler(null);
    };
  }, [currentInstanceId, currentUserStatus, navigate]);

  // Request push permission after user is authenticated (don't block UI)
  useEffect(() => {
    if (currentUserStatus !== "ready") return;
    const timer = setTimeout(() => {
      void pushService
        .requestPermission()
        .then((perm) => {
          if (perm === "granted") {
            void pushService.register();
          }
        })
        .catch(() => {});
    }, 5000);
    return () => clearTimeout(timer);
  }, [currentUserStatus]);

  useEffect(() => {
    const sw = navigator.serviceWorker;
    if (!sw) return;
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "PUSH_NOTIFICATION_CLICK") {
        const nextInstanceId = findInstanceIdByRealmUri(instances, event.data.realmUri);
        if (nextInstanceId != null && nextInstanceId !== currentInstanceId) {
          setCurrentInstanceId(nextInstanceId);
        }
        const route = buildRouteFromPushNotificationClick({
          messageId: event.data.messageId,
          messageType: event.data.messageType,
          streamId: event.data.streamId,
          streamName: event.data.streamName,
          topic: event.data.topic,
          senderId: event.data.senderId,
          realmUri: event.data.realmUri,
        });
        void navigate(route);
      }
    };
    sw.addEventListener("message", handleMessage);
    return () => sw.removeEventListener("message", handleMessage);
  }, [currentInstanceId, instances, navigate, setCurrentInstanceId]);

  const PRESENCE_POLL_MS = 90_000;
  useEffect(() => {
    if (!currentInstanceId || currentUserStatus !== "ready") return;
    let cancelled = false;
    const applyPresence = () => {
      if (cancelled) return;
      void fetchRealmPresence()
        .then((data) => {
          if (cancelled || data.result === "error" || !data.presences) return;
          const store = useUsersStore.getState();
          for (const [email, entry] of Object.entries(data.presences)) {
            const agg = entry.aggregated ?? entry.website;
            if (agg?.status != null && agg?.timestamp != null) {
              store.setPresenceByEmail(email, {
                status: agg.status === "idle" ? "idle" : "active",
                timestamp: agg.timestamp,
              });
            }
          }
        })
        .catch(() => {});
    };
    applyPresence();
    const stopInterval = createResilientInterval(applyPresence, PRESENCE_POLL_MS);
    return () => {
      cancelled = true;
      stopInterval();
    };
  }, [currentInstanceId, currentUserStatus]);

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

  const handleSearchSelectMessage = useCallback(
    (msg: MockMessage) => {
      const currentUserId = useChatListStore.getState().currentUserId ?? null;
      const route = buildRouteFromMessage(msg, currentUserId);
      if (route) {
        void navigate(route);
      }
    },
    [navigate],
  );
  const handleSearchSelectUser = useCallback(
    (userId: number) => {
      void navigate(withCurrentOrgRoute(`/dm/${userId}`));
    },
    [navigate],
  );
  const filteredSidebarChats = useMemo(() => {
    if (selectedFolderId === SYSTEM_PERSONAL_FOLDER_ID) {
      return chatsSortedByLastMessage.filter((chat) => chat.type === "dm");
    }
    if (selectedFolderId === SYSTEM_CHANNELS_FOLDER_ID) {
      return chatsSortedByLastMessage.filter((chat) => chat.type === "stream");
    }
    if (folderChatIds == null) return chatsSortedByLastMessage;
    return chatsSortedByLastMessage.filter((chat) =>
      folderChatIds.has(chatToWorkspaceChatId(chat)),
    );
  }, [chatsSortedByLastMessage, folderChatIds, selectedFolderId]);
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
  const toggleSidebarShortcut = useCallback(() => {
    setSidebarOpen((currentOpen) => resolveShortcutPanelToggle(currentOpen, activeSection));
  }, [activeSection]);
  const toggleInfoPanelShortcut = useCallback(() => {
    handleSetRightDrawerOpen(resolveShortcutPanelToggle(rightDrawerOpen, activeSection));
  }, [activeSection, handleSetRightDrawerOpen, rightDrawerOpen]);
  const navigateToAdjacentChatShortcut = useCallback(
    (direction: "next" | "prev") => {
      const route = resolveChatShortcutRoute({
        sidebarChats: filteredSidebarChats,
        direction,
        activeStreamSlug,
        activeDmIdParam: dmIdParam,
      });
      if (!route) return;
      void navigate(route);
    },
    [filteredSidebarChats, activeStreamSlug, dmIdParam, navigate],
  );
  const navigateToPreviousChatShortcut = useCallback(() => {
    navigateToAdjacentChatShortcut("prev");
  }, [navigateToAdjacentChatShortcut]);
  const navigateToNextChatShortcut = useCallback(() => {
    navigateToAdjacentChatShortcut("next");
  }, [navigateToAdjacentChatShortcut]);

  useShortcut("mod+\\", toggleSidebarShortcut, {
    context: "global",
    enabled: shouldShowChatShell,
  });
  useShortcut("mod+.", toggleInfoPanelShortcut, {
    context: "global",
    enabled: shouldShowChatShell,
  });
  useShortcut("alt+arrowup", navigateToPreviousChatShortcut, {
    context: "sidebar",
    enabled: shouldShowChatShell && filteredSidebarChats.length > 1,
  });
  useShortcut("alt+arrowdown", navigateToNextChatShortcut, {
    context: "sidebar",
    enabled: shouldShowChatShell && filteredSidebarChats.length > 1,
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
  const activeStreamName =
    parsedStream?.stream_id != null
      ? (streamsMap.get(parsedStream.stream_id)?.name ?? parsedStream.stream_name)
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
  useEffect(() => {
    if (rightDrawerTargetUserId == null) {
      return;
    }
    void ensureUserStatusLoaded(rightDrawerTargetUserId);
  }, [rightDrawerTargetUserId]);
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
  const userStatusLabel = formatUserStatusLabel(userFromStore?.status) ?? undefined;
  const profileForRightPanelUser =
    rightDrawerTargetUserId != null && detailedProfile?.userId === rightDrawerTargetUserId
      ? detailedProfile
      : undefined;
  const rightPanelUser = useMemo<RightPanelUserInfo | undefined>(() => {
    const userPresence = userFromStore?.presence;
    if (
      profileForRightPanelUser != null ||
      userFromStore != null ||
      rightDrawerTargetUserId != null
    ) {
      const profileName = profileForRightPanelUser?.fullName?.trim();
      const userName = userFromStore?.full_name?.trim();
      const dmName = dmChat?.name?.trim();
      const resolvedName =
        profileName != null && profileName.length > 0
          ? profileName
          : userName != null && userName.length > 0
            ? userName
            : dmName != null && dmName.length > 0
              ? dmName
              : rightDrawerTargetUserId != null
                ? `User #${rightDrawerTargetUserId}`
                : "";
      const profileAvatarUrl = profileForRightPanelUser?.avatarUrl;
      const resolvedAvatarUrl =
        profileAvatarUrl != null && profileAvatarUrl.length > 0
          ? profileAvatarUrl
          : (userFromStore?.avatar_url ?? undefined);
      const profileEmail = profileForRightPanelUser?.email?.trim();
      const userEmail = userFromStore?.email?.trim();
      const resolvedEmail =
        profileEmail != null && profileEmail.length > 0
          ? profileEmail
          : userEmail != null && userEmail.length > 0
            ? userEmail
            : undefined;
      const resolvedUserId =
        profileForRightPanelUser?.userId ?? userFromStore?.user_id ?? rightDrawerTargetUserId;
      const currentInstanceRealm = instances
        .find((instance) => instance.id === currentInstanceId)
        ?.realm?.trim();
      const profileLink =
        resolvedUserId != null &&
        currentInstanceRealm != null &&
        currentInstanceRealm.length > 0 &&
        isValidRealmUrl(currentInstanceRealm)
          ? `${currentInstanceRealm.replace(/\/+$/, "")}/#user/${resolvedUserId}`
          : undefined;

      return {
        name: resolvedName,
        status: userStatusLabel,
        lastSeen: formatRightPanelLastSeen(userPresence),
        avatarUrl: resolvedAvatarUrl,
        userId: resolvedUserId,
        email: resolvedEmail,
        username: userFromStore?.email ?? undefined,
        role:
          profileForRightPanelUser?.role != null
            ? getRoleLabel(parseRole(profileForRightPanelUser.role))
            : userFromStore?.role != null
              ? getRoleLabel(parseRole(userFromStore.role))
              : undefined,
        timezone: profileForRightPanelUser?.timezone ?? undefined,
        dateJoined: profileForRightPanelUser?.dateJoined ?? undefined,
        isBot: profileForRightPanelUser?.isBot ?? undefined,
        isActive: profileForRightPanelUser?.isActive ?? undefined,
        profileLink,
        phone: profileForRightPanelUser?.phone ?? undefined,
        jobTitle: profileForRightPanelUser?.jobTitle ?? undefined,
        manager: profileForRightPanelUser?.manager ?? undefined,
        birthday: profileForRightPanelUser?.birthday ?? undefined,
        localTime: formatRightPanelLocalTime(profileForRightPanelUser?.timezone),
        media: rightPanelMedia,
        commonGroups: rightPanelCommonGroups,
      };
    }

    if (dmChat && !dmChat.isGroup) {
      return {
        name: dmChat.name,
        status: userStatusLabel,
        lastSeen: formatRightPanelLastSeen(userPresence),
        commonGroups: rightPanelCommonGroups,
      };
    }

    return undefined;
  }, [
    userFromStore,
    profileForRightPanelUser,
    dmChat,
    rightPanelMedia,
    rightPanelCommonGroups,
    userStatusLabel,
    rightDrawerTargetUserId,
    instances,
    currentInstanceId,
  ]);

  // Populate chat-info store with live data for the active chat context.
  // Header counters and right drawer both consume this store.
  useEffect(() => {
    const streamId = parsedStream?.stream_id;
    if (!hasChatInfoContext({ hasDmChat: dmChat != null, streamId })) {
      useChatInfoStore.getState().clear();
      return;
    }

    const usersState = useUsersStore.getState();
    const allUsers = usersState.users;

    if (dmChat) {
      const members = dmParticipantIds
        .map((id) => allUsers.get(id))
        .filter((user): user is NonNullable<typeof user> => user != null);
      useChatInfoStore
        .getState()
        .setData(buildDmChatInfoData(dmChat.name, members, dmParticipantIds.length));
    } else if (streamId != null) {
      let cancelled = false;
      const streamTopics = Array.from(streamsMap.get(streamId)?.topics.values() ?? []).map(
        (topic) => ({
          name: topic.subject,
          unreadCount: topic.unreadCount,
        }),
      );
      Promise.all([fetchStreamMembers(streamId), fetchStreams()])
        .then(([memberIds, streams]) => {
          if (cancelled) return;
          const usersState = useUsersStore.getState();
          const members = memberIds
            .map((id) => usersState.getUser(id))
            .filter((u): u is NonNullable<typeof u> => u != null);
          const description =
            streams.find((stream) => stream.stream_id === streamId)?.description ?? null;
          useChatInfoStore.getState().setData(
            buildStreamChatInfoData(
              activeStreamName ?? "",
              memberIds,
              members,
              useMuteStore.getState().isStreamMuted(streamId),
              {
                description,
                topics: streamTopics,
              },
            ),
          );
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }
  }, [dmChat, dmParticipantIds, parsedStream, activeStreamName, streamsMap]);

  const chatInfoData = useChatInfoStore((s) => s.data);

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
          setOpen: handleSetRightDrawerOpen,
          openUserProfile: handleOpenRightDrawerUserProfile,
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
          <LayoutMediaViewerOverlay />
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
                  {folderRailLayout === "horizontal" ? (
                    <Sidebar
                      streams={streamsFromStore}
                      selectedFolderId={selectedFolderId}
                      pinFolderId={pinFolderIdForSelection}
                      activeStreamSlug={activeStreamSlug ?? null}
                      activeTopic={activeTopic}
                      activeDmIdParam={dmIdParam ?? null}
                      sidebarDms={dmsFromStore}
                      sidebarChats={filteredSidebarChats}
                      pinReorderMode={pinReorderMode}
                      onExitPinReorderMode={handleExitPinReorderMode}
                      onFolderAssignmentsChanged={handleFoldersChanged}
                      activityPanelBottomSlot={
                        <FolderRail
                          folders={folders}
                          selectedFolderId={selectedFolderId}
                          onSelectFolder={handleSelectFolder}
                          onOrderPinning={handleStartOrderPinning}
                          onToggleLayout={handleToggleFolderRailLayout}
                          onFoldersChanged={handleFoldersChanged}
                          layout="horizontal"
                        />
                      }
                    />
                  ) : (
                    <>
                      <FolderRail
                        folders={folders}
                        selectedFolderId={selectedFolderId}
                        onSelectFolder={handleSelectFolder}
                        onOrderPinning={handleStartOrderPinning}
                        onToggleLayout={handleToggleFolderRailLayout}
                        onFoldersChanged={handleFoldersChanged}
                      />
                      <Sidebar
                        streams={streamsFromStore}
                        selectedFolderId={selectedFolderId}
                        pinFolderId={pinFolderIdForSelection}
                        activeStreamSlug={activeStreamSlug ?? null}
                        activeTopic={activeTopic}
                        activeDmIdParam={dmIdParam ?? null}
                        sidebarDms={dmsFromStore}
                        sidebarChats={filteredSidebarChats}
                        pinReorderMode={pinReorderMode}
                        onExitPinReorderMode={handleExitPinReorderMode}
                        onFolderAssignmentsChanged={handleFoldersChanged}
                      />
                    </>
                  )}
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
                      onOpenSettingsDrawer={handleOpenSettingsDrawer}
                      onOpenAboutDrawer={handleOpenAboutDrawer}
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
