/**
 * Mark-as-read wiring for the chat page.
 *
 * Scroll-driven read writes are disabled until the new backend exposes a read-state API.
 */
import { useCallback, useEffect, useRef } from "react";
import { useInboxStore } from "~/entities/inbox/inbox.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import {
  syncUnreadSurfacesFromDelta,
  type UnreadDeltaSyncSource,
} from "~/entities/unread-sync/unread-surfaces-sync.lib";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import type { MockMessage } from "~/shared/api/messenger.types";
import { createLogger } from "~/shared/lib/logger";
import {
  createMessageIdSet,
  messageIdsMissingFromBothLists,
} from "~/shared/lib/message-id-index.lib";
import type { MessageId } from "~/shared/lib/message-id.lib";
import { useShortcut } from "~/shared/lib/shortcuts";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import type { UserId } from "~/shared/lib/user-id.lib";
import {
  applyOpenChatMarkAllAsRead,
  filterMessageIdsStillUnreadForOptimisticApply,
  resolveMarkAllAsReadTarget,
} from "./chat-mark-all-read.lib";
import type { ReadFallbackContext } from "./chat-page.lib";

const log = createLogger("chat-page");

export interface UseChatPageMarkReadParams {
  messages: MockMessage[];
  currentUserId: UserId | null;
  isDmView: boolean;
  activeDmUserIds: UserId[] | null;
  activeStreamId: number | null | undefined;
  activeTopic: string | undefined;
  streamSlug: string | undefined;
  topicName: string | undefined;
  dmIdParam: string | undefined;
  updateMessageFlagsInStore: (messageIds: MessageId[], flag: string, op: "add" | "remove") => void;
}

export interface UseChatPageMarkReadResult {
  handleUnreadMessagesVisible: (messageIds: MessageId[]) => void;
  handleUnreadMessagesAtBottom: (messageIds: MessageId[]) => void;
  handleMarkAllAsRead: () => void;
}

export function useChatPageMarkRead({
  messages,
  currentUserId,
  isDmView,
  activeDmUserIds,
  activeStreamId,
  activeTopic,
  updateMessageFlagsInStore,
}: UseChatPageMarkReadParams): UseChatPageMarkReadResult {
  const latestMessagesRef = useRef<MockMessage[]>([]);
  // Keep messages ref fresh without recreating the mark-as-read batcher on every refresh.
  useEffect(() => {
    latestMessagesRef.current = messages;
  }, [messages]);

  // Runs a local unread change and updates the organization badge right after it.
  const syncLocalUnreadDelta = useCallback(
    (
      source: Extract<
        UnreadDeltaSyncSource,
        "local-chat-read" | "local-chat-read-rollback" | "local-chat-mark-all-read"
      >,
      applyDelta: () => void,
    ) => {
      const instanceId = useInstancesStore.getState().currentInstanceId;
      const mute = useMuteStore.getState();
      syncUnreadSurfacesFromDelta({
        source,
        instanceId,
        isStreamMuted: mute.isStreamMuted,
        isEffectivelyMuted: mute.isEffectivelyMuted,
        applyDelta,
      });
    },
    [],
  );

  const applyReadMessagesOptimistically = useCallback(
    (messageIds: MessageId[], _fallbackContext?: ReadFallbackContext) => {
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
        // Message flags are updated first, then Inbox entries follow in the sync block.
        updateMessageFlagsInStore(unreadMessageIds, "read", "add");
      }

      syncLocalUnreadDelta("local-chat-read", () => {
        if (unreadMessageIds.length > 0) {
          useInboxStore.getState().markAsRead(unreadMessageIds);
        }
      });
    },
    [syncLocalUnreadDelta, updateMessageFlagsInStore],
  );

  const handleUnreadMessagesVisible = useCallback((_messageIds: MessageId[]) => {}, []);

  const handleUnreadMessagesAtBottom = useCallback((_messageIds: MessageId[]) => {}, []);

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
