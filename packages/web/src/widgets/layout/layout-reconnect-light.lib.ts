import { useActivityStore } from "~/entities/activity/activity.model";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInboxStore } from "~/entities/inbox/inbox.model";
import { useUsersStore } from "~/entities/user/user.model";
import { fetchMessagesAfterAnchor } from "~/shared/api/zulip";
import { env } from "~/shared/lib/env";
import { createLogger } from "~/shared/lib/logger";
import {
  logChatListFlow,
  summarizeZulipMessagesForFlowDebug,
} from "~/shared/lib/message-flow-debug.lib";
import { getNewestMessageId } from "./layout-chat-history-sync.lib";
import { getInMemoryLatestMessageId } from "./layout-chat-list-latest-message-id.lib";

const log = createLogger("layout-reconnect");

const LIGHT_DELTA_BATCH_SIZE = 5000;

export interface RefreshLayoutReconnectLightOptions {
  latestMessageIdRef?: { current: number | null };
  isCancelled?: () => boolean;
}

/** Tab resume / focus: sidebar delta from anchor only (no IDB hydrate, no deep history). */
export function refreshLayoutReconnectLight(options: RefreshLayoutReconnectLightOptions): void {
  const { latestMessageIdRef, isCancelled } = options;
  if (isCancelled?.()) return;

  if (env.METADATA_CHAT_BOOTSTRAP_ENABLED) {
    logChatListFlow("reconnectLight: skip sidebar delta (metadata-first)", {});
    return;
  }

  const uid = useChatListStore.getState().currentUserId ?? null;
  const anchor = maxAnchor(latestMessageIdRef?.current ?? null, getInMemoryLatestMessageId());
  if (anchor == null) {
    logChatListFlow("reconnectLight: skip sidebar delta (no anchor)", {});
    return;
  }

  logChatListFlow("reconnectLight: delta after anchor", { anchorMessageId: anchor });

  void fetchMessagesAfterAnchor(anchor, LIGHT_DELTA_BATCH_SIZE)
    .then((deltaMessages) => {
      if (isCancelled?.()) return;
      if (deltaMessages.length === 0) {
        logChatListFlow("reconnectLight: delta empty", { anchorMessageId: anchor });
        return;
      }

      const usersStore = useUsersStore.getState();
      const chatListStore = useChatListStore.getState();
      for (const message of deltaMessages) {
        usersStore.mergeFromMessage(message);
        chatListStore.addMessage(message);
      }

      if (latestMessageIdRef != null) {
        latestMessageIdRef.current =
          getNewestMessageId(deltaMessages) ?? latestMessageIdRef.current;
      }

      useActivityStore.getState().markStale();
      useInboxStore.getState().markStale();
      logChatListFlow("reconnectLight: delta merged", {
        ...summarizeZulipMessagesForFlowDebug(deltaMessages),
        anchorMessageId: anchor,
        currentUserId: uid,
      });
    })
    .catch((error: unknown) => {
      if (isCancelled?.()) return;
      log.warn("reconnectLight: sidebar delta failed", {
        anchorMessageId: anchor,
        error: error instanceof Error ? error.message : String(error),
      });
    });
}

function maxAnchor(refAnchor: number | null, memoryAnchor: number | null): number | null {
  if (refAnchor == null) return memoryAnchor;
  if (memoryAnchor == null) return refAnchor;
  return Math.max(refAnchor, memoryAnchor);
}
