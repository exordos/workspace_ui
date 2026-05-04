// Оркестрация bootstrap + long-poll event loop для активного инстанса.
import { useEffect, useRef } from "react";
import { useActivityStore } from "~/entities/activity/activity.model";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import type {
  ChatListDmMetadataRow,
  ChatListStreamMetadataRow,
} from "~/entities/chat-list/chat-list.model.types";
import { useInboxStore } from "~/entities/inbox/inbox.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import { persistUsersDirectoryToIndexedDb } from "~/entities/user/user-directory-snapshot-persist.lib";
import { useUsersStore } from "~/entities/user/user.model";
import { useUserGroupsStore } from "~/entities/user-group/user-group.model";
import { useChatInfoStore } from "~/features/chat-info/chat-info.model";
import { useJitsiCallStore } from "~/features/jitsi-call/jitsi-call.model";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import { useTypingIndicatorStore } from "~/features/typing-indicator/typing-indicator.model";
import {
  deleteQueue,
  fetchDirectMessagesPage,
  fetchSubscriptions,
  fetchUsers,
  getCurrentUser,
  type ZulipEvent,
} from "~/shared/api/zulip";
import { DEFAULT_REGISTER_FETCH_EVENT_TYPES } from "~/shared/api/zulip-queue";
import type {
  ZulipRawMessage,
  ZulipRecentPrivateConversation,
  ZulipSubscription,
  ZulipUserMember,
} from "~/shared/api/zulip.types";
import {
  loadDmIndexEntries,
  upsertDmIndexEntries,
  upsertDmIndexFromMessages,
  type DmIndexEntry,
} from "~/shared/lib/dm-index";
import { env } from "~/shared/lib/env";
import { startZulipEventLoop } from "~/shared/lib/event-loop";
import { createLogger } from "~/shared/lib/logger";
import {
  logChatListFlow,
  logMessageFlow,
  summarizeZulipMessagesForFlowDebug,
} from "~/shared/lib/message-flow-debug.lib";
import { loadMuteSnapshotRow, persistMuteSnapshotRow } from "~/shared/lib/mute-snapshot-db";
import { playNotificationSound } from "~/shared/lib/notification-sound";
import { notificationService } from "~/shared/lib/notifications";
import { loadUsersDirectoryRow } from "~/shared/lib/users-directory-snapshot-db";
import { getNewestMessageId } from "./layout-chat-history-sync.lib";
import {
  buildLayoutNotificationsActions,
  dispatchZulipEvent,
} from "./layout-zulip-event-dispatch.lib";
import { runLayoutReconnectRefresh } from "./layout-zulip-refresh-stale.lib";
import type { ChatListBootstrapResult } from "./layout-chat-list-bootstrap.lib";
import type { LayoutMuteBootstrapData } from "./layout-instance-bootstrap.hook";

// Increments on effect cleanup so superseded `runChatListBootstrap` runs skip hydrate/API (React Strict Mode).
let chatListBootstrapEffectEpoch = 0;

// Что делает: размер одной фоновой страницы DM-backfill.
const METADATA_DM_BACKFILL_PAGE_SIZE = 5000;
// Зачем: ограничение числа фоновых батчей, чтобы не перегружать сеть.
const METADATA_DM_BACKFILL_MAX_BATCHES = 3;
// Что делает: останавливает backfill, если несколько батчей подряд не добавляют новые DM.
const METADATA_DM_BACKFILL_STAGNATION_LIMIT = 2;
const log = createLogger("layout-zulip-event-loop");

// Что делает: превращает register subscriptions metadata в строки для chat-list store.
function toStreamMetadataRows(
  subscriptions: readonly ZulipSubscription[],
): ChatListStreamMetadataRow[] {
  return subscriptions
    .filter(
      (subscription): subscription is ZulipSubscription =>
        Number.isInteger(subscription.stream_id) &&
        subscription.stream_id > 0 &&
        subscription.name.trim().length > 0,
    )
    .map((subscription) => {
      const creatorId =
        typeof subscription.creator_id === "number" &&
        Number.isInteger(subscription.creator_id) &&
        subscription.creator_id > 0
          ? subscription.creator_id
          : undefined;
      return {
        streamId: subscription.stream_id,
        name: subscription.name,
        // Что делает: пробрасывает channel-level metadata в store, чтобы UI решал права без raw Zulip payload.
        ...(creatorId != null ? { creatorId } : {}),
        ...(typeof subscription.invite_only === "boolean"
          ? { inviteOnly: subscription.invite_only }
          : {}),
        ...(subscription.can_add_subscribers_group != null
          ? { canAddSubscribersGroup: subscription.can_add_subscribers_group }
          : {}),
        ...(subscription.can_remove_subscribers_group != null
          ? { canRemoveSubscribersGroup: subscription.can_remove_subscribers_group }
          : {}),
        ...(subscription.can_administer_channel_group != null
          ? { canAdministerChannelGroup: subscription.can_administer_channel_group }
          : {}),
      };
    });
}

// Что делает: преобразует локальный DM-индекс в формат, который понимает chat-list store.
function toDmMetadataRowsFromIndex(entries: readonly DmIndexEntry[]): ChatListDmMetadataRow[] {
  return entries.map((entry) => ({
    userIds: entry.userIds,
    lastActivityTs: entry.lastActivityTs,
    lastMessageId: entry.lastMessageId,
    unreadCount: entry.unreadCount,
  }));
}

// Что делает: достает последние DM-диалоги из register metadata.
function toDmMetadataRowsFromRecentConversations(
  conversations: Record<string, ZulipRecentPrivateConversation> | undefined,
): ChatListDmMetadataRow[] {
  if (conversations == null) return [];
  const rows: ChatListDmMetadataRow[] = [];
  for (const conversation of Object.values(conversations)) {
    if (!Array.isArray(conversation.user_ids) || conversation.user_ids.length === 0) continue;
    rows.push({
      userIds: conversation.user_ids,
      lastMessageId: conversation.max_message_id ?? null,
      unreadCount: conversation.unread_message_ids?.length ?? 0,
    });
  }
  return rows;
}

// Зачем: после merge metadata сохраняем итоговый DM-слепок, чтобы следующий старт был полнее.
function persistDmIndexFromStore(instanceId: string): void {
  const rows: DmIndexEntry[] = [];
  for (const [dmKey, entry] of useChatListStore.getState().dmsMap.entries()) {
    const userIds =
      entry.userIds?.filter((userId) => Number.isInteger(userId) && userId > 0) ??
      dmKey
        .split(",")
        .map((part) => Number(part))
        .filter((userId) => Number.isInteger(userId) && userId > 0);
    if (userIds.length === 0) continue;
    rows.push({
      dmKey,
      userIds,
      lastActivityTs: entry.ts ?? 0,
      lastMessageId: entry.lastMessageId ?? null,
      unreadCount: entry.unreadCount,
    });
  }
  if (rows.length > 0) {
    upsertDmIndexEntries(instanceId, rows);
  }
}

// Нормализует формат строки IDB к контракту, который ожидает mute-store.
// Зачем: отделить структуру хранения от структуры применения в store.
function toLayoutMuteSnapshotFromRow(row: {
  mutedStreamIds: number[];
  mutedTopics: { streamId: number; topic: string }[];
  unmutedTopics: { streamId: number; topic: string }[];
  followedTopics?: { streamId: number; topic: string }[];
}): {
  mutedStreamIds: number[];
  mutedTopics: { streamId: number; topic: string }[];
  unmutedTopics: { streamId: number; topic: string }[];
  followedTopics: { streamId: number; topic: string }[];
} {
  return {
    mutedStreamIds: row.mutedStreamIds,
    mutedTopics: row.mutedTopics,
    unmutedTopics: row.unmutedTopics,
    followedTopics: row.followedTopics ?? [],
  };
}

export function useLayoutZulipEventLoop(options: {
  currentInstanceId: string | null;
  loadBootstrapMessages: (
    signal: AbortSignal,
    isStale: () => boolean,
  ) => Promise<ChatListBootstrapResult>;
  loadMuteSnapshot: (bootstrap?: LayoutMuteBootstrapData) => Promise<{
    mutedStreamIds: number[];
    mutedTopics: { streamId: number; topic: string }[];
    unmutedTopics: { streamId: number; topic: string }[];
    followedTopics: { streamId: number; topic: string }[];
  }>;
  setFromMessages: (messages: ZulipRawMessage[], currentUserId: number | null) => void;
  setCurrentUserId: (id: number) => void;
  setCurrentUserStatus: (status: "idle" | "loading" | "ready" | "error") => void;
}): void {
  const {
    currentInstanceId,
    loadBootstrapMessages,
    loadMuteSnapshot,
    setFromMessages,
    setCurrentUserId,
    setCurrentUserStatus,
  } = options;

  const loadBootstrapMessagesRef = useRef(loadBootstrapMessages);
  const loadMuteSnapshotRef = useRef(loadMuteSnapshot);
  const setFromMessagesRef = useRef(setFromMessages);
  const setCurrentUserIdRef = useRef(setCurrentUserId);
  const setCurrentUserStatusRef = useRef(setCurrentUserStatus);

  useEffect(() => {
    loadBootstrapMessagesRef.current = loadBootstrapMessages;
    loadMuteSnapshotRef.current = loadMuteSnapshot;
    setFromMessagesRef.current = setFromMessages;
    setCurrentUserIdRef.current = setCurrentUserId;
    setCurrentUserStatusRef.current = setCurrentUserStatus;
  }, [
    loadBootstrapMessages,
    loadMuteSnapshot,
    setFromMessages,
    setCurrentUserId,
    setCurrentUserStatus,
  ]);

  /** Only reset stores when switching org — not when this effect re-runs (callback deps / Strict Mode remount). */
  const prevInstanceForBootstrapRef = useRef<string | null>(null);

  const eventLoopAbortRef = useRef<AbortController | null>(null);
  const queueIdRef = useRef<string | null>(null);
  const instanceAtLoopStartRef = useRef<{ realm: string; email: string; apiKey: string } | null>(
    null,
  );
  const latestMessageIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!currentInstanceId) {
      prevInstanceForBootstrapRef.current = null;
      useUsersStore.getState().setCurrentUserChannelCapabilities({});
      useUserGroupsStore.getState().clear();
      return;
    }
    useUsersStore.getState().setCurrentUserChannelCapabilities({});
    let cancelled = false;
    const bootstrapAbort = new AbortController();
    const bootstrapEpoch = ++chatListBootstrapEffectEpoch;
    const isBootstrapStale = () => bootstrapEpoch !== chatListBootstrapEffectEpoch;

    const instanceSwitched = prevInstanceForBootstrapRef.current !== currentInstanceId;
    // Флаг authoritative-применения из register; после него кэш больше не должен "переехать" состояние.
    let registerMuteSnapshotApplied = false;
    // Параллельная загрузка кэша mute: запускаем заранее, чтобы быстрее отрисовать состояние после switch.
    const cachedMuteSnapshotPromise = instanceSwitched
      ? loadMuteSnapshotRow(currentInstanceId)
          .then((row) => (row ? toLayoutMuteSnapshotFromRow(row) : null))
          .catch(() => null)
      : null;
    if (instanceSwitched) {
      logMessageFlow("eventLoop:clear stores (instance switched)", {
        instanceId: currentInstanceId,
      });
      prevInstanceForBootstrapRef.current = currentInstanceId;
      useUsersStore.getState().clear();
      useUserGroupsStore.getState().clear();
      useActivityStore.getState().clear();
      useInboxStore.getState().clear();
      useChatListStore.getState().clear();
      useCurrentChatMessagesStore.getState().setContext(null);
      useCurrentChatMessagesStore.getState().setMessages([]);
      useJitsiCallStore.getState().clear();
      useMuteStore.getState().clear();
      latestMessageIdRef.current = null;
    }

    void (async () => {
      if (cancelled) return;

      void Promise.resolve().then(() => {
        if (!cancelled) setCurrentUserStatusRef.current("loading");
      });

      // Cache-first mute + users directory run in parallel with chat-list IDB bootstrap and API,
      // so hydrateFromIndexedDbSnapshot is not blocked by unrelated IDB reads.
      const pMuteHydrate =
        instanceSwitched && cachedMuteSnapshotPromise != null
          ? cachedMuteSnapshotPromise.then((cachedMuteSnapshot) => {
              if (cancelled) return;
              if (cachedMuteSnapshot && !registerMuteSnapshotApplied) {
                useMuteStore.getState().setFromServer(cachedMuteSnapshot);
              }
            })
          : Promise.resolve();

      const pUsersDir = instanceSwitched
        ? loadUsersDirectoryRow(currentInstanceId)
            .then((row) => {
              if (cancelled) return;
              if (row?.members?.length) {
                useUsersStore.getState().mergeUsers(row.members);
              }
            })
            .catch(() => {
              // best-effort cache; fetchUsers still hydrates the directory.
            })
        : Promise.resolve();

      const metadataBootstrapEnabled = env.METADATA_CHAT_BOOTSTRAP_ENABLED;
      const metadataDmBackfillEnabled =
        metadataBootstrapEnabled && env.METADATA_DM_BACKFILL_ENABLED;
      const pUsers = fetchUsers();
      const pSubscriptions = fetchSubscriptions();
      const pMessages = loadBootstrapMessagesRef.current(bootstrapAbort.signal, isBootstrapStale);
      const pCurrentUserId = getCurrentUser()
        .then((user) => {
          if (cancelled) return null;
          if (user?.user_id != null) {
            useUsersStore.getState().mergeUser(user);
            setCurrentUserIdRef.current(user.user_id);
            setCurrentUserStatusRef.current("ready");
            return user.user_id;
          } else {
            setCurrentUserStatusRef.current("error");
            useUsersStore.getState().clear();
            useChatListStore.getState().clear();
            return null;
          }
        })
        .catch(() => {
          if (cancelled) return null;
          setCurrentUserStatusRef.current("error");
          useUsersStore.getState().clear();
          useChatListStore.getState().clear();
          return null;
        });

      try {
        const bootstrapBundle = await Promise.all([
          pMuteHydrate,
          pUsersDir,
          pUsers,
          pSubscriptions,
          pMessages,
          pCurrentUserId,
        ]);
        if (cancelled) return;
        const members = bootstrapBundle[2];
        const subscriptions = bootstrapBundle[3];
        const bootstrap = bootstrapBundle[4];
        const resolvedCurrentUserId = bootstrapBundle[5];
        const result = bootstrap;
        const apiMembers: ZulipUserMember[] = members ?? [];
        useUsersStore.getState().mergeUsers(apiMembers);

        const streamRowsFromSubscriptions = toStreamMetadataRows(subscriptions ?? []);
        if (streamRowsFromSubscriptions.length > 0) {
          useChatListStore.getState().upsertStreamMetadataRows(streamRowsFromSubscriptions);
        }

        const uid = resolvedCurrentUserId ?? useChatListStore.getState().currentUserId ?? null;

        logChatListFlow("eventLoop: bootstrap Promise.all settled", {
          instanceId: currentInstanceId,
          metadataBootstrapEnabled,
          metadataDmBackfillEnabled,
          bootstrapMode: result.mode,
          usersMerged: apiMembers.length,
          streamsMapSizeBeforeApply: useChatListStore.getState().streamsMap.size,
          currentUserId: uid,
          bootstrapMessages: summarizeZulipMessagesForFlowDebug(
            result.mode === "full" || result.mode === "delta" ? result.messages : [],
          ),
          latestMessageIdHint: result.latestMessageIdHint,
        });

        if (metadataBootstrapEnabled) {
          // Что делает: сначала показываем DM из metadata, даже если окно сообщений пустое.
          const dmIndexEntries = loadDmIndexEntries(currentInstanceId);
          if (dmIndexEntries.length > 0) {
            useChatListStore
              .getState()
              .upsertDmMetadataRows(toDmMetadataRowsFromIndex(dmIndexEntries));
          }
        }

        if (result.mode === "full") {
          const msgs = result.messages;
          for (const m of msgs) {
            useUsersStore.getState().mergeFromMessage(m);
          }
          if (metadataBootstrapEnabled) {
            // Зачем: metadata-first не должен затирать уже добавленные metadata-строки.
            useChatListStore.getState().addMessages(msgs);
          } else {
            setFromMessagesRef.current(msgs, uid);
          }
          if (currentInstanceId != null && msgs.length > 0) {
            upsertDmIndexFromMessages(currentInstanceId, msgs, uid);
          }
          latestMessageIdRef.current = getNewestMessageId(msgs);
          logChatListFlow("eventLoop: applied bootstrap full to chat list", {
            usedAddMessagesMerge: metadataBootstrapEnabled,
            streamsMapSize: useChatListStore.getState().streamsMap.size,
            dmsMapSize: useChatListStore.getState().dmsMap.size,
          });
        } else if (result.mode === "delta") {
          for (const m of result.messages) {
            useUsersStore.getState().mergeFromMessage(m);
          }
          useChatListStore.getState().addMessages(result.messages);
          if (currentInstanceId != null && result.messages.length > 0) {
            upsertDmIndexFromMessages(currentInstanceId, result.messages, uid);
          }
          const newest = getNewestMessageId(result.messages);
          const prev = result.latestMessageIdHint;
          latestMessageIdRef.current =
            newest != null && (prev == null || newest > prev) ? newest : (prev ?? newest);
          logChatListFlow("eventLoop: applied bootstrap delta (addMessages)", {
            streamsMapSize: useChatListStore.getState().streamsMap.size,
            dmsMapSize: useChatListStore.getState().dmsMap.size,
            latestMessageIdRef: latestMessageIdRef.current,
          });
        } else {
          if (result.latestMessageIdHint != null) {
            latestMessageIdRef.current = result.latestMessageIdHint;
          }
          logChatListFlow("eventLoop: bootstrap mode none after metadata/hydrate", {
            streamsMapSize: useChatListStore.getState().streamsMap.size,
            dmsMapSize: useChatListStore.getState().dmsMap.size,
            latestMessageIdRef: latestMessageIdRef.current,
          });
        }

        if (metadataDmBackfillEnabled && currentInstanceId != null) {
          logChatListFlow("eventLoop: starting metadata DM backfill loop", {
            maxBatches: METADATA_DM_BACKFILL_MAX_BATCHES,
            pageSize: METADATA_DM_BACKFILL_PAGE_SIZE,
          });
          void (async () => {
            let anchor: number | "newest" = "newest";
            let stagnantBatches = 0;
            for (
              let batchIndex = 0;
              batchIndex < METADATA_DM_BACKFILL_MAX_BATCHES;
              batchIndex += 1
            ) {
              if (cancelled) return;
              const page = await fetchDirectMessagesPage(anchor, METADATA_DM_BACKFILL_PAGE_SIZE);
              if (cancelled) return;
              if (page.messages.length === 0) break;

              const currentUserId = useChatListStore.getState().currentUserId ?? uid;
              for (const message of page.messages) {
                useUsersStore.getState().mergeFromMessage(message);
              }
              const dmsBefore = useChatListStore.getState().dmsMap.size;
              useChatListStore.getState().addMessages(page.messages);
              upsertDmIndexFromMessages(currentInstanceId, page.messages, currentUserId);
              const dmsAfter = useChatListStore.getState().dmsMap.size;
              // Что делает: считаем, растет ли число DM. Если нет, завершаем раньше.
              if (dmsAfter <= dmsBefore) {
                stagnantBatches += 1;
              } else {
                stagnantBatches = 0;
              }

              let oldestMessageId = Number.MAX_SAFE_INTEGER;
              for (const message of page.messages) {
                if (message.id < oldestMessageId) oldestMessageId = message.id;
              }
              if (!Number.isFinite(oldestMessageId) || oldestMessageId <= 0) break;
              anchor = oldestMessageId;
              if (page.foundOldest || stagnantBatches >= METADATA_DM_BACKFILL_STAGNATION_LIMIT) {
                break;
              }
            }
          })().catch(() => {});
        }

        const instanceIdPersist = useInstancesStore.getState().currentInstanceId;
        if (instanceIdPersist != null) {
          void persistUsersDirectoryToIndexedDb(instanceIdPersist, apiMembers);
        }

        eventLoopAbortRef.current?.abort();
        eventLoopAbortRef.current = new AbortController();
        queueIdRef.current = null;
        const inst = useInstancesStore.getState().getCurrentInstance();
        instanceAtLoopStartRef.current = inst
          ? { realm: inst.realm, email: inst.email, apiKey: inst.apiKey }
          : null;

        const refreshStaleData = () => {
          runLayoutReconnectRefresh({
            cancelled,
            latestMessageIdRef,
            setFromMessages: (messages, uid) => {
              if (env.METADATA_CHAT_BOOTSTRAP_ENABLED) {
                useChatListStore.getState().addMessages(messages);
                if (currentInstanceId != null) {
                  upsertDmIndexFromMessages(currentInstanceId, messages, uid);
                }
                return;
              }
              setFromMessagesRef.current(messages, uid);
            },
          });
        };

        startZulipEventLoop({
          signal: eventLoopAbortRef.current.signal,
          onReconnect: refreshStaleData,
          onBadQueue: refreshStaleData,
          fetchEventTypes: [...DEFAULT_REGISTER_FETCH_EVENT_TYPES],
          onQueueRegistered: (id, registration) => {
            queueIdRef.current = id;
            if (registration?.jitsi_server_url_effective != null) {
              useInstancesStore
                .getState()
                .setJitsiMeetBaseUrl(registration.jitsi_server_url_effective);
            } else {
              useInstancesStore.getState().setJitsiMeetBaseUrl(null);
            }
            useUsersStore.getState().setCurrentUserChannelCapabilities({
              ...(registration?.realm_can_add_subscribers_group != null
                ? {
                    realmCanAddSubscribersGroup: registration.realm_can_add_subscribers_group,
                  }
                : {}),
            });
            useUserGroupsStore.getState().setGroups(registration?.realm_user_groups ?? []);
            const streamRows = toStreamMetadataRows(registration?.subscriptions ?? []);
            if (streamRows.length > 0) {
              useChatListStore.getState().upsertStreamMetadataRows(streamRows);
            }
            if (metadataBootstrapEnabled) {
              // Что делает: подмешивает recent_private_conversations сразу после register.
              const rows = toDmMetadataRowsFromRecentConversations(
                registration?.recent_private_conversations,
              );
              if (rows.length > 0) {
                logChatListFlow(
                  "eventLoop: registerQueue → upsertDmMetadataRows from recent_private_conversations",
                  {
                    rowCount: rows.length,
                  },
                );
                useChatListStore.getState().upsertDmMetadataRows(rows);
                if (currentInstanceId != null) {
                  persistDmIndexFromStore(currentInstanceId);
                }
              }
            }
            void loadMuteSnapshotRef
              .current({
                subscriptions: registration?.subscriptions,
                userTopics: registration?.user_topics,
              })
              .then((snapshot) => {
                if (!cancelled) {
                  // Register всегда authoritative: после него считаем состояние истинным.
                  registerMuteSnapshotApplied = true;
                  useMuteStore.getState().setFromServer(snapshot);
                  if (currentInstanceId != null) {
                    // Сразу обновляем IDB-снапшот, чтобы следующий cold start поднялся из актуального состояния.
                    void persistMuteSnapshotRow({
                      instanceId: currentInstanceId,
                      version: 1,
                      savedAt: Date.now(),
                      mutedStreamIds: snapshot.mutedStreamIds,
                      mutedTopics: snapshot.mutedTopics,
                      unmutedTopics: snapshot.unmutedTopics,
                      followedTopics: snapshot.followedTopics,
                    });
                  }
                }
              })
              .catch(() => {});
          },
          onEvent(event: ZulipEvent) {
            const chatList = useChatListStore.getState();
            const currentChat = useCurrentChatMessagesStore.getState();
            const users = useUsersStore.getState();
            const mute = useMuteStore.getState();
            const typing = useTypingIndicatorStore.getState();
            const activity = useActivityStore.getState();
            const inbox = useInboxStore.getState();
            const jitsiCall = useJitsiCallStore.getState();

            dispatchZulipEvent(event, {
              chatList,
              currentChat,
              users,
              mute,
              typing,
              activity,
              inbox,
              jitsiCall,
              notifications: buildLayoutNotificationsActions({
                show: notificationService.show,
                closeByTag: (tag) => {
                  void notificationService.closeByTag(tag);
                },
                playSound: (preset) => {
                  if (
                    preset === "default" ||
                    preset === "subtle" ||
                    preset === "digital" ||
                    preset === "glass" ||
                    preset === "pulse" ||
                    preset === "none" ||
                    preset == null
                  ) {
                    playNotificationSound(preset);
                  }
                },
                getSoundPreset: () => useSettingsStore.getState().notificationSound,
              }),
              updateLatestMessageId: (id) => {
                if (latestMessageIdRef.current == null || id > latestMessageIdRef.current) {
                  latestMessageIdRef.current = id;
                }
              },
              onStreamPeerMembersChanged: (streamIds) => {
                if (currentInstanceId == null) return;
                const chatInfoStore = useChatInfoStore.getState();
                for (const streamId of streamIds) {
                  chatInfoStore.invalidateStream(currentInstanceId, streamId);
                }
              },
              onMessage: (message) => {
                if (currentInstanceId == null) return;
                // Зачем: каждое новое DM-сообщение обновляет локальный индекс для следующего старта.
                upsertDmIndexFromMessages(
                  currentInstanceId,
                  [message],
                  useChatListStore.getState().currentUserId,
                );
              },
            });
          },
        });
      } catch (error) {
        log.error("Bootstrap/users initialization failed before starting event loop", {
          instanceId: currentInstanceId,
          error: error instanceof Error ? error.message : String(error),
        });
        logChatListFlow("eventLoop: bootstrap/users initialization failed", {
          instanceId: currentInstanceId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })().catch((error) => {
      setCurrentUserStatusRef.current("error");
      log.error("Unhandled bootstrap orchestration failure", {
        instanceId: currentInstanceId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return () => {
      cancelled = true;
      chatListBootstrapEffectEpoch += 1;
      bootstrapAbort.abort();
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
  }, [currentInstanceId]);
}
