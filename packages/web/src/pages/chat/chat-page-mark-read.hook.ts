/**
 * Mark-as-read wiring for the chat page.
 *
 * Viewport-driven reads send the server action, then local state changes only from
 * explicit server confirmation: `messages.read` events or the returned read message.
 */
import { useCallback, useRef } from "react";
import { markMessagesAsRead } from "~/shared/api/messenger-read-state";
import type { MockMessage } from "~/shared/api/messenger.types";
import { isMessageFromCurrentUser } from "~/shared/lib/message-author.lib";
import type { MessageId } from "~/shared/lib/message-id.lib";
import { useShortcut } from "~/shared/lib/shortcuts";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import type { UserId } from "~/shared/lib/user-id.lib";
import { isWindowActive } from "~/shared/lib/visibility";
import { applyOpenChatMarkAllAsRead, resolveMarkAllAsReadTarget } from "./chat-mark-all-read.lib";

type ReadFlagOperation = "add" | "remove";

interface MessageReadRow {
  message: MockMessage;
  index: number;
  scopeKey: string;
}

export interface UseChatPageMarkReadParams {
  currentUserId: UserId | null;
  isDmView: boolean;
  activeDmUserIds: UserId[] | null;
  activeDmStreamId?: string | null;
  activeStreamId: string | null | undefined;
  activeTopic: string | undefined;
  activeTopicUuid?: string | null;
  streamSlug: string | undefined;
  topicName: string | undefined;
  dmIdParam: string | undefined;
  messages: readonly MockMessage[];
  updateMessageFlagsInStore: (
    messageIds: MessageId[],
    flag: string,
    operation: ReadFlagOperation,
  ) => void;
}

export interface UseChatPageMarkReadResult {
  handleUnreadMessagesVisible: (messageIds: MessageId[]) => void;
  handleUnreadMessagesAtBottom: (messageIds: MessageId[]) => void;
  handleMarkAllAsRead: () => void;
}

function getMessageReadScopeKey(message: MockMessage): string {
  return [message.stream_uuid ?? "dm", message.topic_uuid ?? message.subject ?? ""].join(":");
}

function isUnreadIncomingMessage(message: MockMessage, currentUserId: UserId | null): boolean {
  return message.read === false && !isMessageFromCurrentUser(message, currentUserId);
}

function collectRequestRowsUpTo(
  rows: readonly MessageReadRow[],
  scopeKey: string,
  newestVisibleIndex: number,
  pendingReadIds: ReadonlySet<MessageId>,
  currentUserId: UserId | null,
): MessageId[] {
  const requestIds: MessageId[] = [];
  for (const row of rows) {
    if (row.index > newestVisibleIndex) break;
    if (row.scopeKey !== scopeKey) continue;
    if (!isUnreadIncomingMessage(row.message, currentUserId)) continue;
    if (pendingReadIds.has(row.message.id)) continue;
    requestIds.push(row.message.id);
  }
  return requestIds;
}

export function useChatPageMarkRead({
  currentUserId,
  isDmView,
  activeDmUserIds,
  activeDmStreamId,
  activeStreamId,
  activeTopic,
  activeTopicUuid,
  messages,
  updateMessageFlagsInStore,
}: UseChatPageMarkReadParams): UseChatPageMarkReadResult {
  const pendingReadIdsRef = useRef<Set<MessageId>>(new Set());

  const requestReadForVisibleMessages = useCallback(
    (messageIds: MessageId[]) => {
      if (messageIds.length === 0) return;
      if (!isWindowActive()) return;

      const visibleIds = new Set(messageIds);
      const rows: MessageReadRow[] = messages.map((message, index) => ({
        message,
        index,
        scopeKey: getMessageReadScopeKey(message),
      }));
      const newestVisibleByScope = new Map<string, number>();

      for (const row of rows) {
        if (!visibleIds.has(row.message.id)) continue;
        if (!isUnreadIncomingMessage(row.message, currentUserId)) continue;
        if (pendingReadIdsRef.current.has(row.message.id)) continue;
        const prevIndex = newestVisibleByScope.get(row.scopeKey) ?? -1;
        if (row.index > prevIndex) {
          newestVisibleByScope.set(row.scopeKey, row.index);
        }
      }

      for (const [scopeKey, newestVisibleIndex] of newestVisibleByScope) {
        const requestIds = collectRequestRowsUpTo(
          rows,
          scopeKey,
          newestVisibleIndex,
          pendingReadIdsRef.current,
          currentUserId,
        );
        if (requestIds.length === 0) continue;

        for (const id of requestIds) {
          pendingReadIdsRef.current.add(id);
        }

        void markMessagesAsRead(requestIds)
          .then((confirmedIds) => {
            const ids = Array.isArray(confirmedIds) ? confirmedIds : [];
            if (ids.length > 0) {
              updateMessageFlagsInStore(ids, "read", "add");
            }
          })
          .catch((err) => reportUnexpectedError("chat:autoMarkRead", err))
          .finally(() => {
            for (const id of requestIds) {
              pendingReadIdsRef.current.delete(id);
            }
          });
      }
    },
    [currentUserId, messages, updateMessageFlagsInStore],
  );

  const handleUnreadMessagesVisible = useCallback(
    (messageIds: MessageId[]) => {
      requestReadForVisibleMessages(messageIds);
    },
    [requestReadForVisibleMessages],
  );

  const handleUnreadMessagesAtBottom = useCallback(
    (messageIds: MessageId[]) => {
      requestReadForVisibleMessages(messageIds);
    },
    [requestReadForVisibleMessages],
  );

  const handleMarkAllAsRead = useCallback(() => {
    const target = resolveMarkAllAsReadTarget({
      isDmView,
      activeDmUserIds,
      activeDmStreamId: activeDmStreamId ?? null,
      activeStreamId: activeStreamId ?? null,
      activeTopic,
      activeTopicUuid: activeTopicUuid ?? null,
    });
    if (!target) return;

    void applyOpenChatMarkAllAsRead({
      target,
      currentUserId,
    }).catch((err) => reportUnexpectedError("chat:markAllRead", err));
  }, [
    isDmView,
    activeDmUserIds,
    activeDmStreamId,
    activeStreamId,
    activeTopic,
    activeTopicUuid,
    currentUserId,
  ]);

  useShortcut("mod+shift+m", handleMarkAllAsRead, {
    context: "chat",
    enabled: isDmView
      ? (activeDmUserIds?.length ?? 0) > 0 || activeDmStreamId != null
      : activeStreamId != null && activeTopic != null,
  });

  return {
    handleUnreadMessagesVisible,
    handleUnreadMessagesAtBottom,
    handleMarkAllAsRead,
  };
}
