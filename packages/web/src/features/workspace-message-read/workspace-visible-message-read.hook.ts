import { useCallback, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import {
  selectWorkspaceMessageById,
  useWorkspaceMessageStore,
} from "~/entities/message/message.model";
import { getMessengerReadQueue } from "~/entities/messenger/messenger-read-queue.lib";
import type { MessengerConversationId, MessengerUuid } from "~/entities/messenger/messenger.types";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { isWindowActive } from "~/shared/lib/visibility";

const EMPTY_READ_REQUEST_BOUNDARIES: ReadonlySet<MessengerUuid> = new Set();
export interface UseWorkspaceVisibleMessageReadOptions {
  runtimeContext: WorkspaceRuntimeContext | null;
  conversationId: MessengerConversationId | null;
}
export interface UseWorkspaceVisibleMessageReadResult {
  scheduleReadBatch: (messageUuids: MessengerUuid[]) => void;
  readRequestBoundaryMessageUuids: ReadonlySet<MessengerUuid>;
}
export function useWorkspaceVisibleMessageRead({
  runtimeContext,
  conversationId,
}: UseWorkspaceVisibleMessageReadOptions): UseWorkspaceVisibleMessageReadResult {
  const queueRef = useRef<{
    queue: NonNullable<ReturnType<typeof getMessengerReadQueue>>;
    scopeKey: string | null;
    conversationId: MessengerConversationId | null;
  } | null>(null);
  const scopeKey =
    runtimeContext == null
      ? null
      : `${workspaceRuntimeOwnerKey(runtimeContext)}\u0000${runtimeContext.runtimeGeneration}`;
  useLayoutEffect(() => {
    if (runtimeContext == null) {
      queueRef.current = null;
      return;
    }
    const queue = getMessengerReadQueue(runtimeContext);
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
    (messageUuids: MessengerUuid[]) => {
      const current = queueRef.current;
      if (
        conversationId == null ||
        !isWindowActive() ||
        current?.scopeKey !== scopeKey ||
        current.conversationId !== conversationId
      )
        return;
      const state = useWorkspaceMessageStore.getState();
      for (const uuid of messageUuids) {
        const message = selectWorkspaceMessageById(state, uuid);
        if (
          message != null &&
          (message.conversationId === conversationId ||
            conversationId === `stream:${message.streamUuid}`)
        ) {
          current.queue.enqueue(message);
        }
      }
    },
    [conversationId, scopeKey],
  );
  return useMemo(
    () => ({ scheduleReadBatch, readRequestBoundaryMessageUuids: snapshot }),
    [scheduleReadBatch, snapshot],
  );
}
