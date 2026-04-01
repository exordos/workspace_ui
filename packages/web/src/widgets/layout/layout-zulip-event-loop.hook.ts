import { useEffect, useRef } from "react";
import { useActivityStore } from "~/entities/activity/activity.model";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { persistChatListSnapshotToIndexedDb } from "~/entities/chat-list/chat-list-snapshot-persist.lib";
import { useInboxStore } from "~/entities/inbox/inbox.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import { useUsersStore } from "~/entities/user/user.model";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import { useTypingIndicatorStore } from "~/features/typing-indicator/typing-indicator.model";
import {
  deleteQueue,
  fetchRecentMessages,
  fetchMessagesAfterAnchor,
  fetchRealmPresence,
  fetchUsers,
  getCurrentUser,
  type ZulipEvent,
} from "~/shared/api/zulip";
import { startZulipEventLoop } from "~/shared/lib/event-loop";
import { playNotificationSound } from "~/shared/lib/notification-sound";
import { notificationService } from "~/shared/lib/notifications";
import type { ChatListBootstrapResult } from "./layout-chat-list-bootstrap.lib";
import { buildLayoutNotificationsActions, dispatchZulipEvent } from "./layout-zulip-event-dispatch.lib";
import { logMessageFlow } from "~/shared/lib/message-flow-debug.lib";
import { getNewestMessageId } from "./layout-chat-history-sync.lib";

const RECONNECT_DELTA_BATCH_SIZE = 5000;

export function useLayoutZulipEventLoop(options: {
  currentInstanceId: string | null;
  loadBootstrapMessages: () => Promise<ChatListBootstrapResult>;
  loadMuteSnapshot: () => Promise<{
    mutedStreamIds: number[];
    mutedTopics: { streamId: number; topic: string }[];
    unmutedTopics: { streamId: number; topic: string }[];
  }>;
  setFromMessages: (messages: any[], currentUserId: number | null) => void;
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
  loadBootstrapMessagesRef.current = loadBootstrapMessages;
  const loadMuteSnapshotRef = useRef(loadMuteSnapshot);
  loadMuteSnapshotRef.current = loadMuteSnapshot;
  const setFromMessagesRef = useRef(setFromMessages);
  setFromMessagesRef.current = setFromMessages;
  const setCurrentUserIdRef = useRef(setCurrentUserId);
  setCurrentUserIdRef.current = setCurrentUserId;
  const setCurrentUserStatusRef = useRef(setCurrentUserStatus);
  setCurrentUserStatusRef.current = setCurrentUserStatus;

  /** Only reset stores when switching org — not when this effect re-runs (callback deps / Strict Mode remount). */
  const prevInstanceForBootstrapRef = useRef<string | null>(null);

  const eventLoopAbortRef = useRef<AbortController | null>(null);
  const queueIdRef = useRef<string | null>(null);
  const instanceAtLoopStartRef = useRef<{ realm: string; email: string; apiKey: string } | null>(null);
  const latestMessageIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!currentInstanceId) {
      prevInstanceForBootstrapRef.current = null;
      return;
    }
    let cancelled = false;

    const instanceSwitched = prevInstanceForBootstrapRef.current !== currentInstanceId;
    if (instanceSwitched) {
      logMessageFlow("eventLoop:clear stores (instance switched)", {
        instanceId: currentInstanceId,
      });
      prevInstanceForBootstrapRef.current = currentInstanceId;
      useUsersStore.getState().clear();
      useActivityStore.getState().clear();
      useInboxStore.getState().clear();
      useChatListStore.getState().clear();
      useCurrentChatMessagesStore.getState().setContext(null);
      useCurrentChatMessagesStore.getState().setMessages([]);
      latestMessageIdRef.current = null;
    }

    void Promise.resolve().then(() => {
      if (!cancelled) setCurrentUserStatusRef.current("loading");
    });

    const pUsers = fetchUsers();
    const pMessages = loadBootstrapMessagesRef.current();

    getCurrentUser()
      .then((user) => {
        if (cancelled) return;
        if (user?.user_id != null) {
          useUsersStore.getState().mergeUser(user);
          setCurrentUserIdRef.current(user.user_id);
          setCurrentUserStatusRef.current("ready");
        } else {
          setCurrentUserStatusRef.current("error");
          useUsersStore.getState().clear();
          useChatListStore.getState().clear();
        }
      })
      .catch(() => {
        if (cancelled) return;
        setCurrentUserStatusRef.current("error");
        useUsersStore.getState().clear();
        useChatListStore.getState().clear();
      });

    Promise.all([pUsers, pMessages])
      .then(([members, bootstrap]) => {
        if (cancelled) return;
        const result = bootstrap as ChatListBootstrapResult;
        useUsersStore.getState().mergeUsers((members as any[]) ?? []);

        const uid = useChatListStore.getState().currentUserId ?? null;

        if (result.mode === "full") {
          const msgs = result.messages;
          for (const m of msgs) {
            useUsersStore.getState().mergeFromMessage(m as any);
          }
          setFromMessagesRef.current(msgs, uid);
          latestMessageIdRef.current = getNewestMessageId(msgs as any);
        } else if (result.mode === "delta") {
          for (const m of result.messages) {
            useUsersStore.getState().mergeFromMessage(m as any);
          }
          useChatListStore.getState().addMessages(result.messages);
          const newest = getNewestMessageId(result.messages as any);
          const prev = result.latestMessageIdHint;
          latestMessageIdRef.current =
            newest != null && (prev == null || newest > prev) ? newest : (prev ?? newest);
        } else {
          if (result.latestMessageIdHint != null) {
            latestMessageIdRef.current = result.latestMessageIdHint;
          }
        }

        const instanceIdPersist = useInstancesStore.getState().currentInstanceId;
        if (instanceIdPersist != null) {
          void persistChatListSnapshotToIndexedDb(instanceIdPersist);
        }

        eventLoopAbortRef.current?.abort();
        eventLoopAbortRef.current = new AbortController();
        queueIdRef.current = null;
        const inst = useInstancesStore.getState().getCurrentInstance();
        instanceAtLoopStartRef.current = inst ? { realm: inst.realm, email: inst.email, apiKey: inst.apiKey } : null;

        const refreshStaleData = () => {
          if (cancelled) return;
          const uid = useChatListStore.getState().currentUserId ?? null;
          const hydrateFromRecentWindow = () => {
            fetchRecentMessages()
              .then((freshMsgs) => {
                if (cancelled) return;
                for (const m of freshMsgs) {
                  useUsersStore.getState().mergeFromMessage(m as any);
                }
                setFromMessagesRef.current(freshMsgs as any, uid);
                latestMessageIdRef.current = getNewestMessageId(freshMsgs as any);
                const idPersist = useInstancesStore.getState().currentInstanceId;
                if (idPersist != null) {
                  void persistChatListSnapshotToIndexedDb(idPersist);
                }
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
                  usersStore.mergeFromMessage(message as any);
                  chatListStore.addMessage(message as any);
                }

                latestMessageIdRef.current =
                  getNewestMessageId(deltaMessages as any) ?? latestMessageIdRef.current;
                useActivityStore.getState().markStale();
                useInboxStore.getState().markStale();
                const idPersist = useInstancesStore.getState().currentInstanceId;
                if (idPersist != null) {
                  void persistChatListSnapshotToIndexedDb(idPersist);
                }
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
            void loadMuteSnapshotRef.current()
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
            const users = useUsersStore.getState();
            const mute = useMuteStore.getState();
            const typing = useTypingIndicatorStore.getState();
            const activity = useActivityStore.getState();
            const inbox = useInboxStore.getState();

            dispatchZulipEvent(event, {
              chatList,
              currentChat,
              users,
              mute,
              typing,
              activity,
              inbox,
              notifications: buildLayoutNotificationsActions({
                show: notificationService.show,
                closeByTag: notificationService.closeByTag,
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
            });
          },
        });
      })
      .catch(() => {
        // ignore: user may already be loaded
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
  }, [currentInstanceId]);
}

