import { filterStreamMessagesForSidebar } from "~/entities/chat-list/chat-list-stream-preview-from-messages.lib";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useUsersStore } from "~/entities/user/user.model";
import { logChatListFlow } from "~/shared/lib/message-flow-debug.lib";
import { getNewestMessageId } from "./layout-chat-history-sync.lib";
import { runChatListBootstrap } from "./layout-chat-list-bootstrap.lib";
import { getCachedRegisterUnreadSnapshot } from "./layout-instance-register-unread.lib";
import { reconcileSidebarUnreadAfterBootstrap } from "./layout-sidebar-unread-reconcile.lib";

export interface RefreshLayoutReconnectLightOptions {
  instanceId?: string | null;
  latestMessageIdRef?: { current: number | null };
  isCancelled?: () => boolean;
}

/**
 * Tab resume / focus: reconcile unread from cached register, then apply a small stream preview delta
 * (no queue re-register — previews use preserveSidebarTotals).
 */
export async function refreshLayoutReconnectLight(
  options: RefreshLayoutReconnectLightOptions,
): Promise<void> {
  if (options.isCancelled?.()) return;

  const instanceId = options.instanceId ?? null;
  const uid = useChatListStore.getState().currentUserId ?? null;
  const registerSnapshot =
    instanceId != null ? getCachedRegisterUnreadSnapshot(instanceId) : undefined;
  reconcileSidebarUnreadAfterBootstrap({
    cancelled: () => options.isCancelled?.() ?? false,
    instanceId,
    currentUserId: uid,
    registerSnapshot,
    logScope: "reconnectLight",
    snapshotSource: "cached-register",
    syncSource: "reconnect-light",
  });

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
      options.latestMessageIdRef.current =
        newest != null && (prev == null || newest > prev) ? newest : (prev ?? newest);
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
