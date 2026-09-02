import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { compareWorkspaceMessages } from "~/entities/message/message-workspace-order.lib";
import {
  selectWorkspaceMessageById,
  useWorkspaceMessageStore,
} from "~/entities/message/message.model";
import { markMessengerMessagesReadUpTo } from "~/entities/messenger/messenger-message-actions.lib";
import type {
  MessengerConversationId,
  MessengerMessage,
  MessengerUuid,
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

interface ReadRequestProjection {
  scopeKey: string | null;
  byTopic: ReadonlyMap<string, MessengerUuid>;
}

const EMPTY_READ_REQUEST_BOUNDARIES = new Set<MessengerUuid>();

export interface UseWorkspaceVisibleMessageReadOptions {
  runtimeContext: WorkspaceRuntimeContext | null;
  conversationId: MessengerConversationId | null;
}

export interface UseWorkspaceVisibleMessageReadResult {
  scheduleReadBatch: (messageUuids: MessengerUuid[]) => void;
  readRequestBoundaryMessageUuids: ReadonlySet<MessengerUuid>;
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
}: UseWorkspaceVisibleMessageReadOptions): UseWorkspaceVisibleMessageReadResult {
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
  const [readRequestProjection, setReadRequestProjection] = useState<ReadRequestProjection>(() => ({
    scopeKey,
    byTopic: new Map(),
  }));

  const setTopicReadRequestBoundary = useCallback(
    (requestScopeKey: string, topicKey: string, messageUuid: MessengerUuid | null): void => {
      setReadRequestProjection((current) => {
        if (current.scopeKey !== requestScopeKey) return current;
        const previousMessageUuid = current.byTopic.get(topicKey);
        if (messageUuid == null) {
          if (previousMessageUuid == null) return current;
        } else if (previousMessageUuid === messageUuid) {
          return current;
        }

        const byTopic = new Map(current.byTopic);
        if (messageUuid == null) {
          byTopic.delete(topicKey);
        } else {
          byTopic.set(topicKey, messageUuid);
        }
        return { scopeKey: current.scopeKey, byTopic };
      });
    },
    [],
  );

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
      for (const [key, queue] of queuesRef.current) {
        queuesRef.current.set(key, { ...queue, pending: null });
        if (requestScopeKey != null && queue.inFlight == null) {
          setTopicReadRequestBoundary(requestScopeKey, key, null);
        }
      }
      return;
    }

    const now = Date.now();
    let nextPendingDelay: number | null = null;
    for (const [key, queue] of queuesRef.current) {
      const pending = queue.pending;
      if (pending == null || queue.inFlight != null) continue;
      if (queue.retryNotBefore > now) {
        const delay = queue.retryNotBefore - now;
        nextPendingDelay = nextPendingDelay == null ? delay : Math.min(nextPendingDelay, delay);
        continue;
      }
      const queueWithoutPending = { ...queue, pending: null };
      queuesRef.current.set(key, queueWithoutPending);

      const currentMessage = selectWorkspaceMessageById(
        useWorkspaceMessageStore.getState(),
        pending.message.uuid,
      );
      if (
        currentMessage == null ||
        currentMessage.read ||
        (!currentMessage.isOwn &&
          queue.lastApplied != null &&
          compareWorkspaceMessages(currentMessage, queue.lastApplied) <= 0)
      ) {
        setTopicReadRequestBoundary(requestScopeKey, key, null);
        continue;
      }

      const inFlight = { ...pending, message: currentMessage };
      queuesRef.current.set(key, {
        ...queueWithoutPending,
        inFlight,
        retryNotBefore: 0,
      });
      setTopicReadRequestBoundary(requestScopeKey, key, currentMessage.uuid);
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
          if (scopeKeyRef.current !== requestScopeKey) return;
          if (result.status === "applied") {
            const latestQueue = queuesRef.current.get(key);
            if (latestQueue != null) {
              queuesRef.current.set(key, {
                ...latestQueue,
                lastApplied: laterMessage(latestQueue.lastApplied, currentMessage),
              });
            }
          }
          setTopicReadRequestBoundary(requestScopeKey, key, null);
        })
        .catch(() => {
          if (scopeKeyRef.current !== requestScopeKey || controller.signal.aborted) return;

          const latestQueue = queuesRef.current.get(key);
          if (latestQueue?.inFlight?.message.uuid !== currentMessage.uuid) return;

          const laterPending =
            latestQueue.pending != null &&
            compareWorkspaceMessages(latestQueue.pending.message, currentMessage) > 0;
          let nextPending = latestQueue.pending;
          if (!laterPending && inFlight.retryCount < MAX_READ_RETRY_COUNT) {
            nextPending = laterBoundary(nextPending, {
              message: currentMessage,
              retryCount: inFlight.retryCount + 1,
            });
          }
          if (nextPending != null) {
            const nextRetryCount = inFlight.retryCount + 1;
            queuesRef.current.set(key, {
              ...latestQueue,
              pending: nextPending,
              retryNotBefore: Date.now() + retryDelayMs(nextRetryCount),
            });
            setTopicReadRequestBoundary(requestScopeKey, key, nextPending.message.uuid);
          } else {
            setTopicReadRequestBoundary(requestScopeKey, key, null);
          }
        })
        .finally(() => {
          controllersRef.current.delete(controller);
          if (scopeKeyRef.current !== requestScopeKey) return;
          const latestQueue = queuesRef.current.get(key);
          if (latestQueue?.inFlight?.message.uuid !== currentMessage.uuid) return;
          const queueAfterFlight = { ...latestQueue, inFlight: null };
          queuesRef.current.set(key, queueAfterFlight);
          if (queueAfterFlight.pending != null) {
            armTimer(Math.max(0, queueAfterFlight.retryNotBefore - Date.now()));
          }
        });
    }

    if (nextPendingDelay != null) armTimer(nextPendingDelay);
  }, [armTimer, conversationId, setTopicReadRequestBoundary]);

  useLayoutEffect(() => {
    if (scopeKeyRef.current !== scopeKey) {
      clearQueues();
      setReadRequestProjection({ scopeKey, byTopic: new Map() });
    }
    runtimeContextRef.current = runtimeContext;
    scopeKeyRef.current = scopeKey;
    flushRef.current = flush;
  }, [clearQueues, flush, runtimeContext, scopeKey]);

  useEffect(() => {
    return () => {
      scopeKeyRef.current = null;
      clearQueues();
    };
  }, [clearQueues]);

  const scheduleReadBatch = useCallback(
    (messageUuids: MessengerUuid[]): void => {
      if (messageUuids.length === 0 || scopeKey == null || !isWindowActive()) return;
      const messageStore = useWorkspaceMessageStore.getState();
      let scheduled = false;

      for (const messageUuid of messageUuids) {
        const message = selectWorkspaceMessageById(messageStore, messageUuid);
        if (message == null || message.read) continue;
        const key = topicQueueKey(message);
        const queue = queuesRef.current.get(key) ?? {
          pending: null,
          inFlight: null,
          lastApplied: null,
          retryNotBefore: 0,
        };
        if (
          !message.isOwn &&
          queue.inFlight != null &&
          compareWorkspaceMessages(message, queue.inFlight.message) <= 0
        ) {
          queuesRef.current.set(key, queue);
          continue;
        }
        if (
          !message.isOwn &&
          queue.lastApplied != null &&
          compareWorkspaceMessages(message, queue.lastApplied) <= 0
        ) {
          queuesRef.current.set(key, queue);
          continue;
        }
        queuesRef.current.set(key, {
          ...queue,
          pending: laterBoundary(queue.pending, { message, retryCount: 0 }),
        });
        scheduled = true;
      }

      if (scheduled) armTimer();
    },
    [armTimer, scopeKey],
  );

  const readRequestBoundaryMessageUuids = useMemo(() => {
    if (readRequestProjection.scopeKey !== scopeKey || readRequestProjection.byTopic.size === 0) {
      return EMPTY_READ_REQUEST_BOUNDARIES;
    }
    return new Set(readRequestProjection.byTopic.values());
  }, [readRequestProjection, scopeKey]);

  return useMemo(
    () => ({ scheduleReadBatch, readRequestBoundaryMessageUuids }),
    [readRequestBoundaryMessageUuids, scheduleReadBatch],
  );
}
