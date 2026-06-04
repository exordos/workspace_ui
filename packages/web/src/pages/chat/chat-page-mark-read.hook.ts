/**
 * Mark-as-read batching and mark-all-read for the chat page.
 *
 * Debounces scroll-driven read API calls, applies optimistic store updates,
 * and wires the mark-all-read keyboard shortcut.
 */
import { useCallback, useEffect, useRef } from "react";
import {
  applyChatListReadDecrement,
  readFallbackContextFromCurrentChat,
} from "~/entities/chat-list/chat-list-apply-read-decrement.lib";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import { markMessagesAsRead } from "~/shared/api/zulip-read-state";
import type { MockMessage } from "~/shared/api/zulip.types";
import { createLogger } from "~/shared/lib/logger";
import {
  createMessageIdSet,
  messageIdsMissingFromBothLists,
} from "~/shared/lib/message-id-index.lib";
import { useShortcut } from "~/shared/lib/shortcuts";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import {
  applyOpenChatMarkAllAsRead,
  filterMessageIdsStillUnreadForOptimisticApply,
  resolveMarkAllAsReadTarget,
} from "./chat-mark-all-read.lib";
import { createMarkAsReadBatcher } from "./chat-mark-as-read.lib";
import { buildReadFallbackContext, type ReadFallbackContext } from "./chat-page.lib";

const log = createLogger("chat-page");

export interface UseChatPageMarkReadParams {
  messages: MockMessage[];
  currentUserId: number | null;
  isDmView: boolean;
  activeDmUserIds: number[] | null;
  activeStreamId: number | null | undefined;
  activeTopic: string | undefined;
  streamSlug: string | undefined;
  topicName: string | undefined;
  dmIdParam: string | undefined;
  updateMessageFlagsInStore: (messageIds: number[], flag: string, op: "add" | "remove") => void;
}

export interface UseChatPageMarkReadResult {
  handleUnreadMessagesVisible: (messageIds: number[]) => void;
  handleUnreadMessagesAtBottom: (messageIds: number[]) => void;
  handleMarkAllAsRead: () => void;
}

export function useChatPageMarkRead({
  messages,
  currentUserId,
  isDmView,
  activeDmUserIds,
  activeStreamId,
  activeTopic,
  streamSlug,
  topicName,
  dmIdParam,
  updateMessageFlagsInStore,
}: UseChatPageMarkReadParams): UseChatPageMarkReadResult {
  const latestMessagesRef = useRef<MockMessage[]>([]);
  // Keep messages ref fresh without recreating the mark-as-read batcher on every refresh.
  useEffect(() => {
    latestMessagesRef.current = messages;
  }, [messages]);

  const markAsReadBatcherRef = useRef<ReturnType<typeof createMarkAsReadBatcher> | null>(null);

  const applyReadMessagesOptimistically = useCallback(
    (messageIds: number[], fallbackContext?: ReadFallbackContext) => {
      if (messageIds.length === 0) return;

      const storeMessages = useCurrentChatMessagesStore.getState().messages;
      const effectiveMessages = latestMessagesRef.current;
      const unreadMessageIds = filterMessageIdsStillUnreadForOptimisticApply(messageIds, {
        storeMessages,
        effectiveMessages,
      });
      if (unreadMessageIds.length === 0) {
        const missingFromBothLists = messageIdsMissingFromBothLists(
          messageIds,
          createMessageIdSet(storeMessages),
          createMessageIdSet(effectiveMessages),
        );
        if (missingFromBothLists.length > 0) {
          log.warn("markAsRead optimistic: ids missing from store and effective message lists", {
            missingCount: missingFromBothLists.length,
            requestedCount: messageIds.length,
          });
        }
      } else {
        updateMessageFlagsInStore(unreadMessageIds, "read", "add");
      }

      const readFallback =
        fallbackContext ??
        readFallbackContextFromCurrentChat(useCurrentChatMessagesStore.getState().context);

      const chatListState = useChatListStore.getState();
      applyChatListReadDecrement(() => useChatListStore.getState(), chatListState, {
        messageIds,
        fallbackContext: readFallback,
        clampWhenAlreadyRead: unreadMessageIds.length === 0,
        source: "chat:optimisticMarkRead",
      });
    },
    [updateMessageFlagsInStore],
  );

  const handleUnreadMessagesVisible = useCallback(
    (messageIds: number[]) => {
      if (!isDmView && activeTopic == null) return;
      markAsReadBatcherRef.current?.schedule(messageIds);
    },
    [isDmView, activeTopic],
  );

  const handleUnreadMessagesAtBottom = useCallback(
    (messageIds: number[]) => {
      if (!isDmView && activeTopic == null) return;
      markAsReadBatcherRef.current?.schedule(messageIds);
    },
    [isDmView, activeTopic],
  );

  useEffect(() => {
    const batchFallbackContext = buildReadFallbackContext({
      isDmView,
      activeDmUserIds,
      currentUserId,
      activeStreamId,
      activeTopic,
    });

    const batcher = createMarkAsReadBatcher({
      debounceMs: 250,
      markAsRead: markMessagesAsRead,
      onSchedule: (messageIds) => {
        applyReadMessagesOptimistically(messageIds, batchFallbackContext);
      },
      onError: (error, messageIds) => {
        if (messageIds.length > 0) {
          updateMessageFlagsInStore(messageIds, "read", "remove");
          useChatListStore.getState().incrementUnreadForMessages(messageIds);
        }
        log.warn("markAsRead failed", {
          requestedCount: messageIds.length,
          error: error instanceof Error ? error.message : String(error),
        });
      },
    });
    markAsReadBatcherRef.current = batcher;
    return () => {
      batcher.cancel();
      if (markAsReadBatcherRef.current === batcher) {
        markAsReadBatcherRef.current = null;
      }
    };
  }, [
    streamSlug,
    topicName,
    dmIdParam,
    isDmView,
    activeDmUserIds,
    currentUserId,
    activeStreamId,
    activeTopic,
    applyReadMessagesOptimistically,
    updateMessageFlagsInStore,
  ]);

  const handleMarkAllAsRead = useCallback(() => {
    const target = resolveMarkAllAsReadTarget({
      isDmView,
      activeDmUserIds,
      activeStreamId: activeStreamId ?? null,
      activeTopic,
    });
    if (!target) return;

    void applyOpenChatMarkAllAsRead({
      target,
      loadedMessages: messages,
      currentUserId,
      applyOptimistic: applyReadMessagesOptimistically,
    }).catch((err) => reportUnexpectedError("chat:markAllRead", err));
  }, [
    isDmView,
    activeDmUserIds,
    activeStreamId,
    activeTopic,
    messages,
    currentUserId,
    applyReadMessagesOptimistically,
  ]);

  useShortcut("mod+shift+m", handleMarkAllAsRead, {
    context: "chat",
    enabled: isDmView
      ? (activeDmUserIds?.length ?? 0) > 0
      : activeStreamId != null && activeTopic != null,
  });

  return {
    handleUnreadMessagesVisible,
    handleUnreadMessagesAtBottom,
    handleMarkAllAsRead,
  };
}
