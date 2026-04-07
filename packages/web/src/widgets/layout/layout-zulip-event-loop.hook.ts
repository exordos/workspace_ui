import { useEffect, useRef } from "react";
import { useActivityStore } from "~/entities/activity/activity.model";
import { persistChatListSnapshotToIndexedDb } from "~/entities/chat-list/chat-list-snapshot-persist.lib";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInboxStore } from "~/entities/inbox/inbox.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import { persistUsersDirectoryToIndexedDb } from "~/entities/user/user-directory-snapshot-persist.lib";
import { useUsersStore } from "~/entities/user/user.model";
import { useJitsiCallStore } from "~/features/jitsi-call/jitsi-call.model";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import { useTypingIndicatorStore } from "~/features/typing-indicator/typing-indicator.model";
import { deleteQueue, fetchUsers, getCurrentUser, type ZulipEvent } from "~/shared/api/zulip";
import type { ZulipRawMessage, ZulipUserMember } from "~/shared/api/zulip.types";
import { startZulipEventLoop } from "~/shared/lib/event-loop";
import { logMessageFlow } from "~/shared/lib/message-flow-debug.lib";
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

export function useLayoutZulipEventLoop(options: {
  currentInstanceId: string | null;
  loadBootstrapMessages: () => Promise<ChatListBootstrapResult>;
  loadMuteSnapshot: () => Promise<{
    mutedStreamIds: number[];
    mutedTopics: { streamId: number; topic: string }[];
    unmutedTopics: { streamId: number; topic: string }[];
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
      useJitsiCallStore.getState().clear();
      latestMessageIdRef.current = null;
    }

    void (async () => {
      if (instanceSwitched) {
        const row = await loadUsersDirectoryRow(currentInstanceId);
        if (cancelled) return;
        if (row?.members?.length) {
          useUsersStore.getState().mergeUsers(row.members);
        }
      }

      if (cancelled) return;

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

      try {
        const [members, bootstrap] = await Promise.all([pUsers, pMessages]);
        if (cancelled) return;
        const result = bootstrap;
        const apiMembers: ZulipUserMember[] = members ?? [];
        useUsersStore.getState().mergeUsers(apiMembers);

        const uid = useChatListStore.getState().currentUserId ?? null;

        if (result.mode === "full") {
          const msgs = result.messages;
          for (const m of msgs) {
            useUsersStore.getState().mergeFromMessage(m);
          }
          setFromMessagesRef.current(msgs, uid);
          latestMessageIdRef.current = getNewestMessageId(msgs);
        } else if (result.mode === "delta") {
          for (const m of result.messages) {
            useUsersStore.getState().mergeFromMessage(m);
          }
          useChatListStore.getState().addMessages(result.messages);
          const newest = getNewestMessageId(result.messages);
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
            setFromMessages: (messages, uid) => setFromMessagesRef.current(messages, uid),
          });
        };

        startZulipEventLoop({
          signal: eventLoopAbortRef.current.signal,
          onReconnect: refreshStaleData,
          onBadQueue: refreshStaleData,
          onQueueRegistered: (id) => {
            queueIdRef.current = id;
            void loadMuteSnapshotRef
              .current()
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
      } catch {
        // ignore: bootstrap / users fetch may fail
      }
    })().catch(() => {});

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
