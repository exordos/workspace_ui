import { useCallback, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useChatsCatalog } from "~/entities/messenger/chats";
import { getMessageReadRequests } from "~/entities/messenger/message-commands";
import {
  readActiveMessageIndex,
  selectKnownMessage,
} from "~/entities/messenger/messages-consumers";
import type { MessengerConversationId, MessengerUuid } from "~/entities/messenger/messenger.types";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { isWindowActive } from "~/shared/lib/visibility";

const EMPTY_READ_REQUEST_BOUNDARIES: ReadonlySet<MessengerUuid> = new Set();
export interface UseWorkspaceVisibleMessageReadOptions {
  runtimeContext: WorkspaceRuntimeContext | null;
  conversationId: MessengerConversationId | null;
  topicUuid?: MessengerUuid | null;
}
export interface UseWorkspaceVisibleMessageReadResult {
  scheduleReadBatch: (
    messageUuids: MessengerUuid[],
    options?: { allowReadAnchor?: boolean },
  ) => void;
  scheduleTopicReadAtBottom: () => void;
  readRequestBoundaryMessageUuids: ReadonlySet<MessengerUuid>;
}
export function useWorkspaceVisibleMessageRead({
  runtimeContext,
  conversationId,
  topicUuid = null,
}: UseWorkspaceVisibleMessageReadOptions): UseWorkspaceVisibleMessageReadResult {
  const queueRef = useRef<{
    queue: NonNullable<ReturnType<typeof getMessageReadRequests>>;
    scopeKey: string | null;
    conversationId: MessengerConversationId | null;
  } | null>(null);
  const ownerKey = runtimeContext == null ? null : workspaceRuntimeOwnerKey(runtimeContext);
  const scopeKey =
    runtimeContext == null ? null : `${ownerKey}\u0000${runtimeContext.runtimeGeneration}`;
  const topicUnreadCount = useChatsCatalog((state) =>
    ownerKey != null && state.ownerKey === ownerKey && topicUuid != null
      ? (state.topicsById[topicUuid]?.unreadCount ?? 0)
      : 0,
  );
  const topicLastMessageUuid = useChatsCatalog((state) =>
    ownerKey != null && state.ownerKey === ownerKey && topicUuid != null
      ? (state.topicsById[topicUuid]?.lastMessageUuid ??
        (conversationId == null
          ? null
          : state.conversationsById[conversationId]?.lastMessageUuid) ??
        null)
      : null,
  );
  useLayoutEffect(() => {
    if (runtimeContext == null) {
      queueRef.current = null;
      return;
    }
    const queue = getMessageReadRequests(runtimeContext);
    if (queue == null) return;
    queueRef.current = { queue, scopeKey, conversationId };
    return () => {
      queueRef.current = null;
    };
  }, [runtimeContext, scopeKey, conversationId]);
  const subscribe = useCallback(
    (listener: () => void) => {
      const current = queueRef.current;
      return current?.scopeKey === scopeKey && current.conversationId === conversationId
        ? current.queue.subscribe(listener)
        : () => undefined;
    },
    [scopeKey, conversationId],
  );
  const getSnapshot = useCallback(() => {
    return queueRef.current?.scopeKey === scopeKey
      ? queueRef.current.queue.getSnapshot()
      : EMPTY_READ_REQUEST_BOUNDARIES;
  }, [scopeKey]);
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => EMPTY_READ_REQUEST_BOUNDARIES,
  );
  const scheduleReadBatch = useCallback(
    (messageUuids: MessengerUuid[], options?: { allowReadAnchor?: boolean }) => {
      const current = queueRef.current;
      if (
        conversationId == null ||
        !isWindowActive() ||
        current?.scopeKey !== scopeKey ||
        current.conversationId !== conversationId
      )
        return;
      const state = readActiveMessageIndex();
      for (const uuid of messageUuids) {
        const message = selectKnownMessage(state, uuid);
        if (
          message != null &&
          (message.conversationId === conversationId ||
            conversationId === `stream:${message.streamUuid}`)
        ) {
          current.queue.enqueue(message, options);
        }
      }
    },
    [conversationId, scopeKey],
  );
  const scheduleTopicReadAtBottom = useCallback(() => {
    if (topicUnreadCount > 0 && topicLastMessageUuid != null) {
      scheduleReadBatch([topicLastMessageUuid], { allowReadAnchor: true });
    }
  }, [scheduleReadBatch, topicLastMessageUuid, topicUnreadCount]);
  return useMemo(
    () => ({
      scheduleReadBatch,
      scheduleTopicReadAtBottom,
      readRequestBoundaryMessageUuids: snapshot,
    }),
    [scheduleReadBatch, scheduleTopicReadAtBottom, snapshot],
  );
}
