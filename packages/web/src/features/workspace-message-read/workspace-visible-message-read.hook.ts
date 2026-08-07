import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { compareWorkspaceMessages } from "~/entities/message/message-workspace-order.lib";
import {
  selectWorkspaceMessageById,
  useWorkspaceMessageStore,
} from "~/entities/message/message.model";
import { markMessengerMessagesReadUpTo } from "~/entities/messenger/messenger-message-actions.lib";
import type {
  MessengerConversationId,
  MessengerMessage,
} from "~/entities/messenger/messenger.types";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { isWindowActive } from "~/shared/lib/visibility";

const READ_BATCH_DELAY_MS = 250;
const READ_RETRY_BASE_DELAY_MS = 500;
const MAX_READ_RETRY_COUNT = 2;

interface PendingReadBoundary {
  message: MessengerMessage;
  retryCount: number;
}

interface TopicReadQueue {
  pending: PendingReadBoundary | null;
  inFlight: PendingReadBoundary | null;
  lastApplied: MessengerMessage | null;
  retryNotBefore: number;
}

export interface UseWorkspaceVisibleMessageReadOptions {
  runtimeContext: WorkspaceRuntimeContext | null;
  conversationId: MessengerConversationId | null;
}

function topicQueueKey(message: MessengerMessage): string {
  return `${message.streamUuid}\u0000${message.topicUuid}`;
}

function laterMessage(
  current: MessengerMessage | null,
  candidate: MessengerMessage,
): MessengerMessage {
  return current == null || compareWorkspaceMessages(candidate, current) > 0 ? candidate : current;
}

function laterBoundary(
  current: PendingReadBoundary | null,
  candidate: PendingReadBoundary,
): PendingReadBoundary {
  return current == null || compareWorkspaceMessages(candidate.message, current.message) > 0
    ? candidate
    : current;
}

function retryDelayMs(retryCount: number): number {
  return READ_RETRY_BASE_DELAY_MS * 2 ** Math.max(0, retryCount - 1);
}

export function useWorkspaceVisibleMessageRead({
  runtimeContext,
  conversationId,
}: UseWorkspaceVisibleMessageReadOptions): (messageUuids: string[]) => void {
  const runtimeContextRef = useRef(runtimeContext);
  const queuesRef = useRef<Map<string, TopicReadQueue>>(new Map());
  const controllersRef = useRef<Set<AbortController>>(new Set());
  const timerRef = useRef<number | null>(null);
  const timerDueAtRef = useRef<number | null>(null);
  const flushRef = useRef<() => void>(() => undefined);
  const ownerKey = runtimeContext == null ? null : workspaceRuntimeOwnerKey(runtimeContext);
  const scopeKey =
    ownerKey == null || runtimeContext == null || conversationId == null
      ? null
      : `${ownerKey}\u0000${runtimeContext.runtimeGeneration}\u0000${conversationId}`;
  const scopeKeyRef = useRef(scopeKey);

  const armTimer = useCallback((delayMs = READ_BATCH_DELAY_MS): void => {
    const dueAt = Date.now() + delayMs;
    if (
      timerRef.current != null &&
      timerDueAtRef.current != null &&
      timerDueAtRef.current <= dueAt
    ) {
      return;
    }
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
    }
    timerDueAtRef.current = dueAt;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      timerDueAtRef.current = null;
      flushRef.current();
    }, delayMs);
  }, []);

  const clearQueues = useCallback((): void => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
      timerDueAtRef.current = null;
    }
    for (const controller of controllersRef.current) controller.abort();
    controllersRef.current.clear();
    queuesRef.current.clear();
  }, []);

  const flush = useCallback((): void => {
    const currentRuntimeContext = runtimeContextRef.current;
    const requestScopeKey = scopeKeyRef.current;
    if (
      !isWindowActive() ||
      currentRuntimeContext == null ||
      conversationId == null ||
      requestScopeKey == null
    ) {
      for (const queue of queuesRef.current.values()) queue.pending = null;
      return;
    }

    const now = Date.now();
    let nextPendingDelay: number | null = null;
    for (const queue of queuesRef.current.values()) {
      const pending = queue.pending;
      if (pending == null || queue.inFlight != null) continue;
      if (queue.retryNotBefore > now) {
        const delay = queue.retryNotBefore - now;
        nextPendingDelay = nextPendingDelay == null ? delay : Math.min(nextPendingDelay, delay);
        continue;
      }
      queue.pending = null;

      const currentMessage = selectWorkspaceMessageById(
        useWorkspaceMessageStore.getState(),
        pending.message.uuid,
      );
      if (
        currentMessage == null ||
        currentMessage.read ||
        currentMessage.isOwn ||
        (queue.lastApplied != null &&
          compareWorkspaceMessages(currentMessage, queue.lastApplied) <= 0)
      ) {
        continue;
      }

      const inFlight = { ...pending, message: currentMessage };
      queue.inFlight = inFlight;
      queue.retryNotBefore = 0;
      const controller = new AbortController();
      controllersRef.current.add(controller);
      void markMessengerMessagesReadUpTo({
        runtimeContext: currentRuntimeContext,
        getRuntimeContext: () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
        signal: controller.signal,
        messageUuid: currentMessage.uuid,
        conversationIds: [conversationId],
      })
        .then((result) => {
          if (scopeKeyRef.current !== requestScopeKey || result.status !== "applied") return;
          queue.lastApplied = laterMessage(queue.lastApplied, currentMessage);
        })
        .catch(() => {
          if (scopeKeyRef.current !== requestScopeKey || controller.signal.aborted) return;

          const laterPending =
            queue.pending != null &&
            compareWorkspaceMessages(queue.pending.message, currentMessage) > 0;
          if (!laterPending && inFlight.retryCount < MAX_READ_RETRY_COUNT) {
            queue.pending = laterBoundary(queue.pending, {
              message: currentMessage,
              retryCount: inFlight.retryCount + 1,
            });
          }
          if (queue.pending != null) {
            const nextRetryCount = inFlight.retryCount + 1;
            queue.retryNotBefore = Date.now() + retryDelayMs(nextRetryCount);
          }
        })
        .finally(() => {
          controllersRef.current.delete(controller);
          if (scopeKeyRef.current !== requestScopeKey) return;
          if (queue.inFlight?.message.uuid === currentMessage.uuid) queue.inFlight = null;
          if (queue.pending != null) {
            armTimer(Math.max(0, queue.retryNotBefore - Date.now()));
          }
        });
    }

    if (nextPendingDelay != null) armTimer(nextPendingDelay);
  }, [armTimer, conversationId]);

  useLayoutEffect(() => {
    if (scopeKeyRef.current !== scopeKey) clearQueues();
    runtimeContextRef.current = runtimeContext;
    scopeKeyRef.current = scopeKey;
    flushRef.current = flush;
  }, [clearQueues, flush, runtimeContext, scopeKey]);

  useEffect(() => {
    return () => clearQueues();
  }, [clearQueues]);

  return useCallback(
    (messageUuids: string[]): void => {
      if (messageUuids.length === 0 || scopeKey == null || !isWindowActive()) return;
      const messageStore = useWorkspaceMessageStore.getState();
      let scheduled = false;

      for (const messageUuid of messageUuids) {
        const message = selectWorkspaceMessageById(messageStore, messageUuid);
        if (message == null || message.read || message.isOwn) continue;
        const key = topicQueueKey(message);
        const queue = queuesRef.current.get(key) ?? {
          pending: null,
          inFlight: null,
          lastApplied: null,
          retryNotBefore: 0,
        };
        if (
          (queue.inFlight != null &&
            compareWorkspaceMessages(message, queue.inFlight.message) <= 0) ||
          (queue.lastApplied != null && compareWorkspaceMessages(message, queue.lastApplied) <= 0)
        ) {
          queuesRef.current.set(key, queue);
          continue;
        }
        queue.pending = laterBoundary(queue.pending, { message, retryCount: 0 });
        queuesRef.current.set(key, queue);
        scheduled = true;
      }

      if (scheduled) armTimer();
    },
    [armTimer, scopeKey],
  );
}
