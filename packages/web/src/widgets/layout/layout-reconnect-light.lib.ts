import { filterStreamMessagesForSidebar } from "~/entities/chat-list/chat-list-stream-preview-from-messages.lib";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useUsersStore } from "~/entities/user/user.model";
import { logChatListFlow } from "~/shared/lib/message-flow-debug.lib";
import type { MessageId } from "~/shared/lib/message-id.lib";
import { getNewestMessageId } from "./layout-chat-history-sync.lib";
import { runChatListBootstrap } from "./layout-chat-list-bootstrap.lib";

export interface RefreshLayoutReconnectLightOptions {
  instanceId?: string | null;
  latestMessageIdRef?: { current: MessageId | null };
  isCancelled?: () => boolean;
}

/** Tab resume / focus: apply a small stream preview delta without touching server unread counts. */
export async function refreshLayoutReconnectLight(
  options: RefreshLayoutReconnectLightOptions,
): Promise<void> {
  if (options.isCancelled?.()) return;

  const instanceId = options.instanceId ?? null;
  if (instanceId == null) {
    logChatListFlow("reconnectLight: skip stream delta (no instanceId)", {});
    return;
  }

  try {
    const result = await runChatListBootstrap(instanceId, {
      isStale: options.isCancelled,
      kind: "reconnect",
    });
    if (options.isCancelled?.()) return;
    if (result.mode !== "streamPreviews" || result.messages.length === 0) {
      logChatListFlow("reconnectLight: no stream preview delta", {
        mode: result.mode,
      });
      return;
    }

    const streamOnly = filterStreamMessagesForSidebar(result.messages);
    if (streamOnly.length === 0) return;

    for (const message of streamOnly) {
      useUsersStore.getState().mergeFromMessage(message);
    }
    useChatListStore.getState().applyStreamSidebarPreviewsFromMessages(streamOnly);
    const newest = getNewestMessageId(streamOnly);
    const prev = result.latestMessageIdHint;
    if (options.latestMessageIdRef != null) {
      options.latestMessageIdRef.current = newest ?? prev ?? options.latestMessageIdRef.current;
    }
    logChatListFlow("reconnectLight: applied stream preview delta", {
      messageCount: streamOnly.length,
    });
  } catch (error) {
    if (options.isCancelled?.()) return;
    logChatListFlow("reconnectLight: stream delta failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
