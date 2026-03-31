import { useEffect, useRef } from "react";
import { useActivityStore } from "~/entities/activity";
import { useChatListStore } from "~/entities/chat-list";
import { useInboxStore } from "~/entities/inbox";
import { useInstancesStore } from "~/entities/instance";
import { useCurrentChatMessagesStore } from "~/entities/message";
import { useUsersStore } from "~/entities/user";
import { useMuteStore } from "~/features/mute-chat";
import { useSettingsStore } from "~/features/settings";
import { useTypingIndicatorStore } from "~/features/typing-indicator";
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
import { buildLayoutNotificationsActions, dispatchZulipEvent } from "./layout-zulip-event-dispatch.lib";
import { getNewestMessageId } from "./layout-chat-history-sync.lib";

const RECONNECT_DELTA_BATCH_SIZE = 5000;

export function useLayoutZulipEventLoop(options: {
  currentInstanceId: string | null;
  loadBootstrapMessages: () => Promise<unknown[] | null | undefined>;
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

  const eventLoopAbortRef = useRef<AbortController | null>(null);
  const queueIdRef = useRef<string | null>(null);
  const instanceAtLoopStartRef = useRef<{ realm: string; email: string; apiKey: string } | null>(null);
  const latestMessageIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!currentInstanceId) return;
    let cancelled = false;

    void Promise.resolve().then(() => {
      if (!cancelled) setCurrentUserStatus("loading");
    });

    useUsersStore.getState().clear();
    useChatListStore.getState().clear();
    useActivityStore.getState().clear();
    useInboxStore.getState().clear();
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
        if (cancelled) return;
        setCurrentUserStatus("error");
        useUsersStore.getState().clear();
        useChatListStore.getState().clear();
      });

    Promise.all([pUsers, pMessages])
      .then(([members, messages]) => {
        if (cancelled) return;
        const msgs = (messages as any[]) ?? [];
        useUsersStore.getState().mergeUsers((members as any[]) ?? []);
        for (const m of msgs) {
          useUsersStore.getState().mergeFromMessage(m as any);
        }
        const uid = useChatListStore.getState().currentUserId ?? null;
        setFromMessages(msgs, uid);
        latestMessageIdRef.current = getNewestMessageId(msgs as any);

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
                setFromMessages(freshMsgs as any, uid);
                latestMessageIdRef.current = getNewestMessageId(freshMsgs as any);
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
  }, [
    currentInstanceId,
    loadBootstrapMessages,
    loadMuteSnapshot,
    setFromMessages,
    setCurrentUserId,
    setCurrentUserStatus,
  ]);
}

