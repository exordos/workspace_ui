/**
 * Reconnect / bad-queue recovery: refetch recent or delta messages and merge realm presence.
 * Used by `useLayoutZulipEventLoop` without resetting the long-poll loop.
 */
import { useActivityStore } from "~/entities/activity/activity.model";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { persistChatListSnapshotToIndexedDb } from "~/entities/chat-list/chat-list-snapshot-persist.lib";
import { useInboxStore } from "~/entities/inbox/inbox.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useUsersStore } from "~/entities/user/user.model";
import {
  fetchMessagesAfterAnchor,
  fetchRecentMessages,
  fetchRealmPresence,
} from "~/shared/api/zulip";
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
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
  const hydrateFromRecentWindow = () => {
    fetchRecentMessages()
      .then((freshMsgs) => {
        if (cancelled) return;
        for (const m of freshMsgs) {
          useUsersStore.getState().mergeFromMessage(m);
        }
        setFromMessages(freshMsgs, uid);
        latestMessageIdRef.current = getNewestMessageId(freshMsgs);
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
          usersStore.mergeFromMessage(message);
          chatListStore.addMessage(message);
        }

        latestMessageIdRef.current =
          getNewestMessageId(deltaMessages) ?? latestMessageIdRef.current;
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
      if (cancelled) return;
      applyRealmPresenceResponseToUsers(data);
    })
    .catch(() => {});
}
