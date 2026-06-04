/**
 * Authoritative sync of unread @mentions count via GET /messages (is:mentioned + is:unread).
 */
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useUsersStore } from "~/entities/user/user.model";
import {
  fetchUnreadMentionsPage,
  MENTIONS_UNREAD_SYNC_PAGE_SIZE,
} from "~/shared/api/zulip-messages";
import { createLogger } from "~/shared/lib/logger";
import { runInFlightDeduped } from "~/shared/lib/request-lifecycle.lib";

const log = createLogger("chat-list:mentions-sync");

export interface EnsureMentionsUnreadSyncedOptions {
  currentInstanceId: string | null;
  currentUserId: number | null;
  forceRefresh?: boolean;
  pageSize?: number;
}

export async function ensureMentionsUnreadSynced(
  options: EnsureMentionsUnreadSyncedOptions,
): Promise<void> {
  const {
    currentInstanceId,
    currentUserId,
    forceRefresh = false,
    pageSize = MENTIONS_UNREAD_SYNC_PAGE_SIZE,
  } = options;

  if (currentInstanceId == null) {
    return;
  }

  const requestKey = `${currentInstanceId}:mentions-unread-sync:${pageSize}`;

  await runInFlightDeduped(requestKey, async () => {
    const store = useChatListStore.getState();
    if (!forceRefresh && store.mentionsUnreadApiSynced && store.mentionsUnreadCount >= 0) {
      return;
    }

    try {
      const page = await fetchUnreadMentionsPage(pageSize);
      if (useInstancesStore.getState().currentInstanceId !== currentInstanceId) {
        return;
      }
      for (const message of page.messages) {
        useUsersStore.getState().mergeFromMessage({
          id: message.id,
          sender_id: message.sender_id,
          sender_full_name: message.sender_full_name,
          content: message.content,
          timestamp: message.timestamp,
          display_recipient: message.display_recipient,
        });
      }
      const capped = !page.foundOldest && page.messages.length >= pageSize;
      useChatListStore.getState().upsertMentionMessageLocations(page.messages);
      useChatListStore.getState().reconcileMentionsFromServer(page.messages, { capped });
      log.info("mentions unread synced", {
        instanceId: currentInstanceId,
        count: useChatListStore.getState().mentionsUnreadCount,
        capped,
        currentUserId,
      });
    } catch (error) {
      log.warn("mentions unread sync failed", {
        instanceId: currentInstanceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
