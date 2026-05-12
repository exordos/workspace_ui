// Восстановительный refresh после reconnect/bad queue.
// Обновляет сообщения и presence без полного сброса event loop.
/**
 * Reconnect / bad-queue recovery: refetch recent or delta messages and merge realm presence.
 * Used by `useLayoutZulipEventLoop` without resetting the long-poll loop.
 */
import { useActivityStore } from "~/entities/activity/activity.model";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInboxStore } from "~/entities/inbox/inbox.model";
import { useUsersStore } from "~/entities/user/user.model";
import {
  fetchMessagesAfterAnchor,
  fetchRecentMessages,
  fetchRealmPresence,
  fetchUnreadMessagesSnapshot,
} from "~/shared/api/zulip";
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import {
  logChatListFlow,
  summarizeZulipMessagesForFlowDebug,
} from "~/shared/lib/message-flow-debug.lib";
import { getNewestMessageId } from "./layout-chat-history-sync.lib";
import { applyRealmPresenceResponseToUsers } from "./layout-zulip-presence-apply.lib";

const RECONNECT_DELTA_BATCH_SIZE = 5000;

export interface RunLayoutReconnectRefreshOptions {
  cancelled: boolean;
  latestMessageIdRef: { current: number | null };
  setFromMessages: (messages: ZulipRawMessage[], uid: number | null) => void;
}

/** After reconnect or bad queue: refresh messages window + presence without tearing down the loop. */
export function runLayoutReconnectRefresh(options: RunLayoutReconnectRefreshOptions): void {
  const { cancelled, latestMessageIdRef, setFromMessages } = options;
  if (cancelled) return;

  const uid = useChatListStore.getState().currentUserId ?? null;
  // Что делает: при reconnect отдельно сверяет unread snapshot с сервером.
  // Зачем: message delta добавляет только новые сообщения и не исправляет уже залипшие cached unread счетчики.
  fetchUnreadMessagesSnapshot()
    .then((messages) => {
      if (cancelled || messages == null) return;
      useChatListStore.getState().reconcileUnreadFromMessages(messages, uid);
    })
    .catch(() => {});

  const hydrateFromRecentWindow = () => {
    logChatListFlow("reconnectRefresh: no anchor → fetchRecentMessages + setFromMessages", {});
    fetchRecentMessages()
      .then((freshMsgs) => {
        if (cancelled) return;
        for (const m of freshMsgs) {
          useUsersStore.getState().mergeFromMessage(m);
        }
        setFromMessages(freshMsgs, uid);
        latestMessageIdRef.current = getNewestMessageId(freshMsgs);
        logChatListFlow("reconnectRefresh: recent window applied", {
          ...summarizeZulipMessagesForFlowDebug(freshMsgs),
          latestMessageIdRef: latestMessageIdRef.current,
        });
      })
      .catch(() => {
        logChatListFlow("reconnectRefresh: fetchRecentMessages failed", {});
      });
  };

  const latestMessageId = latestMessageIdRef.current;
  if (latestMessageId == null) {
    hydrateFromRecentWindow();
  } else {
    logChatListFlow("reconnectRefresh: delta after anchor via addMessage", {
      anchorMessageId: latestMessageId,
      batchSize: RECONNECT_DELTA_BATCH_SIZE,
    });
    fetchMessagesAfterAnchor(latestMessageId, RECONNECT_DELTA_BATCH_SIZE)
      .then((deltaMessages) => {
        if (cancelled) return;
        if (deltaMessages.length === 0) {
          logChatListFlow("reconnectRefresh: delta empty (no new messages)", {});
          return;
        }

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
        logChatListFlow("reconnectRefresh: delta merged into chat list", {
          ...summarizeZulipMessagesForFlowDebug(deltaMessages),
          latestMessageIdRef: latestMessageIdRef.current,
        });
      })
      .catch(() => {
        logChatListFlow("reconnectRefresh: delta failed → fallback recent window", {});
        hydrateFromRecentWindow();
      });
  }

  fetchRealmPresence()
    .then((data) => {
      if (cancelled) return;
      applyRealmPresenceResponseToUsers(data);
    })
    .catch(() => {});
}
