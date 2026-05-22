/**
 * Current chat messages store — holds messages for the active chat view.
 *
 * Resets on context (stream/topic or DM) change; updated by real-time events
 * for reactions, flags, content edits, and deletions.
 */
import { create } from "zustand";
import { useUsersStore } from "~/entities/user/user.model";
import { getCurrentInstance } from "~/shared/api/client";
import { fetchMessagesWithNarrowPage } from "~/shared/api/zulip";
import type { MockMessage } from "~/shared/api/zulip.types";
import { createLogger, logStoreAction } from "~/shared/lib/logger";
import {
  deleteMessagesByIds,
  patchMessageContentInCache,
  patchMessageFlagsInCache,
  patchMessageReactionInCache,
  putSingleMessage,
  updateChatMetaPatch,
  upsertChatMessages,
} from "~/shared/lib/message-cache-db";
import { chatKeyFromContext, chatKeyFromMockMessage } from "~/shared/lib/message-cache-keys.lib";
import { logMessageFlow, summarizeChatContextForLog } from "~/shared/lib/message-flow-debug.lib";
import { filterMessageLinkPreviewsForMarkdown } from "~/shared/lib/message-link-preview-filter.lib";
import { upsertLinkPreviewOnMessage } from "~/shared/lib/message-link-preview-list.lib";
import { mergeMessagePreservingLinkPreview } from "~/shared/lib/message-link-preview-merge.lib";
import { applyPendingLinkPreviewsToMessage } from "~/shared/lib/message-link-preview-pending.lib";
import { traceLinkPreview } from "~/shared/lib/message-link-preview-trace.lib";
import {
  computeHasNewerAfterLoadNewerIdbPage,
  computeHasOlderAfterLoadOlderIdbPage,
} from "~/shared/lib/message-pagination-boundary.lib";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import { resolveTopicMoveTargetMessageIds } from "~/shared/lib/update-message-topic-move.lib";
import { zulipMessageCacheWindowN } from "~/shared/lib/zulip-message-window.lib";
import {
  patchPartitionMetaByMessages,
  upsertMessagesByChatPartitions,
} from "./message-cache-partition.lib";
import { parseDmKeyToUserIds } from "./message-chat-context.lib";
import { loadInitialMessagesRouteDriven } from "./message-initial-loader.lib";
import { persistChatMessagesToIndexedDb } from "./message-local-cache.lib";
import { buildSendingEchoKeyIndex } from "./message-outgoing-echo-index.lib";
import { outgoingEchoContentMatches } from "./message-outgoing-echo.lib";
import { patchMessageAtId, patchMessagesFlags } from "./message-patch.lib";
import type { CurrentChatContext, CurrentChatMessagesState } from "./message.model.types";

export type { CurrentChatContext } from "./message.model.types";
export { contextFromMessage, isMessageForContext } from "./message-chat-context.lib";

const loadOlderLog = createLogger("messages:loadOlder");

function hydratedMessagesMatchContext(
  messages: readonly MockMessage[],
  next: CurrentChatContext,
  currentUserId: number | null,
): boolean {
  if (messages.length === 0) return true;
  if (next.type === "dm") {
    const expected = chatKeyFromContext({ type: "dm", dmKey: next.dmKey });
    return messages.every((m) => chatKeyFromMockMessage(m, currentUserId) === expected);
  }
  if (next.streamWideView) {
    return messages.every((m) => m.stream_id === next.streamId);
  }
  const expected = chatKeyFromContext({
    type: "stream",
    streamId: next.streamId,
    topic: next.topic,
  });
  return messages.every((m) => chatKeyFromMockMessage(m, currentUserId) === expected);
}

// Что делает: хранит актуальный "поколенческий" номер initial-load запроса.
// Зачем: чтобы поздние ответы старых запросов нельзя было применить в store.
let initialLoadGeneration = 0;

// Что делает: хранит AbortController для текущей initial-load загрузки.
// Зачем: при новом клике по чату немедленно отменять предыдущий network refresh.
let initialLoadAbortController: AbortController | null = null;

// Что делает: проверяет abort-ошибку единым образом.
// Зачем: корректно отличать штатную отмену от реальной ошибки загрузки.
function isAbortLikeError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

// Что делает: подписывает внутренний controller на внешний signal (если он есть).
// Зачем: cleanup эффекта в UI должен отменять тот же in-flight запрос, что контролирует store.
function bindExternalAbortSignal(
  controller: AbortController,
  externalSignal?: AbortSignal,
): () => void {
  if (!externalSignal) {
    return () => {};
  }
  const onExternalAbort = () => {
    controller.abort();
  };
  externalSignal.addEventListener("abort", onExternalAbort);
  if (externalSignal.aborted) {
    controller.abort();
  }
  return () => {
    externalSignal.removeEventListener("abort", onExternalAbort);
  };
}

function mergeUsersFromMessages(messages: readonly MockMessage[]): void {
  const store = useUsersStore.getState();
  for (const msg of messages) {
    store.mergeUser({
      user_id: msg.sender_id,
      full_name: msg.sender_full_name ?? "",
    });
  }
}

function withOutgoingDeliveryStatus(message: MockMessage): MockMessage {
  if (message.id > 0) {
    return { ...message, delivery_status: "sent" };
  }
  return { ...message, delivery_status: "failed" };
}

function withPendingLinkPreviewsIfPersisted(message: MockMessage): MockMessage {
  return message.id > 0 ? applyPendingLinkPreviewsToMessage(message) : message;
}

// Что делает: синхронизирует текущий набор сообщений из store в IDB.
// Зачем: после локальных мутаций (append/prepend/replace) держать cache-слой актуальным.
function schedulePersistFullChatMessages(get: () => CurrentChatMessagesState): void {
  if (!persistChatMessagesToIndexedDb()) return;
  const inst = getCurrentInstance()?.id;
  const ctx = get().context;
  const msgs = get().messages;
  if (!inst || !ctx || msgs.length === 0) return;
  // Что делает: в wide-контексте пишет сообщения по topic-partitions,
  // чтобы не складывать всю stream-ленту в один topic-key.
  if (ctx.type === "stream" && ctx.streamWideView) {
    void upsertMessagesByChatPartitions({
      instanceId: inst,
      currentUserId: null,
      messages: msgs,
    });
    return;
  }
  const windowN = zulipMessageCacheWindowN(ctx);
  void upsertChatMessages({
    instanceId: inst,
    chatKey: chatKeyFromContext(ctx),
    messages: msgs,
    windowSizeN: windowN,
  });
}

// Что делает: выбирает chat key для сохранения конкретного сообщения.
// Зачем: даже при wide-контексте запись должна идти в key фактического topic.
function resolvePersistChatKeyForMessage(
  context: CurrentChatContext,
  message: MockMessage,
): string {
  if (context.type === "stream" && context.streamWideView) {
    return chatKeyFromContext({
      type: "stream",
      streamId: context.streamId,
      topic: normalizeTopicForIdentity(message.subject ?? ""),
    });
  }
  return chatKeyFromContext(context);
}

export const useCurrentChatMessagesStore = create<CurrentChatMessagesState>((set, get) => ({
  context: null,
  messages: [],
  pendingOutgoingEchoKeys: [],
  isLoadingMore: false,
  isLoadingNewer: false,
  hasOlderMessages: true,
  hasNewerMessages: false,
  boundaryLoadFailed: false,

  clearBoundaryLoadFailed() {
    set({ boundaryLoadFailed: false });
  },

  setContext(context) {
    const prev = get().context;
    const cachedMessages: MockMessage[] = [];

    let nextContext: CurrentChatContext | null = context;
    if (prev != null && context?.type === "stream" && prev.type === "stream") {
      nextContext = {
        ...prev,
        streamName: context.streamName,
        streamId: context.streamId,
        topic: context.topic,
        streamWideView: context.streamWideView ?? prev.streamWideView,
      };
    }

    logMessageFlow("store:setContext", {
      prev: summarizeChatContextForLog(prev),
      next: summarizeChatContextForLog(nextContext),
      persistIdb: persistChatMessagesToIndexedDb(),
      nextStoreMessagesLen: cachedMessages.length,
    });

    set({
      context: nextContext,
      messages: cachedMessages,
      pendingOutgoingEchoKeys: [],
      isLoadingMore: false,
      isLoadingNewer: false,
      hasOlderMessages: true,
      hasNewerMessages: false,
      boundaryLoadFailed: false,
    });
  },

  setContextFromNavigation(context) {
    get().setContext(context);
  },

  setMessages(messages) {
    set({ messages, pendingOutgoingEchoKeys: [] });
    if (persistChatMessagesToIndexedDb()) {
      schedulePersistFullChatMessages(get);
    }
  },

  prependMessages(msgs) {
    set((state) => {
      const existingIds = new Set(state.messages.map((m) => m.id));
      const fresh = msgs.filter((m) => !existingIds.has(m.id));
      if (fresh.length === 0) return state;
      return { messages: [...fresh, ...state.messages] };
    });
    if (persistChatMessagesToIndexedDb()) {
      schedulePersistFullChatMessages(get);
    }
  },

  appendMessages(msgs) {
    set((state) => {
      const existingIds = new Set(state.messages.map((m) => m.id));
      const fresh = msgs
        .filter((m) => !existingIds.has(m.id))
        .map(withPendingLinkPreviewsIfPersisted);
      if (fresh.length === 0) return state;
      return { messages: [...state.messages, ...fresh] };
    });
    if (persistChatMessagesToIndexedDb()) {
      schedulePersistFullChatMessages(get);
    }
  },

  appendMessage(msg) {
    const idbRef: {
      current:
        | { kind: "none" }
        | { kind: "put"; message: MockMessage }
        | { kind: "mergeReplace"; removeId: number; message: MockMessage };
    } = { current: { kind: "none" } };

    set((state) => {
      if (msg.id > 0) {
        const sendingEchoIndex = buildSendingEchoKeyIndex(state.messages);
        for (let qi = 0; qi < state.pendingOutgoingEchoKeys.length; qi++) {
          const echoKey = state.pendingOutgoingEchoKeys[qi]!;
          const msgIdx = sendingEchoIndex.get(echoKey) ?? -1;
          const pendingMessage = msgIdx >= 0 ? state.messages[msgIdx] : undefined;
          if (
            pendingMessage?.delivery_status === "sending" &&
            pendingMessage.sender_id === msg.sender_id &&
            outgoingEchoContentMatches(pendingMessage, msg)
          ) {
            const prev = state.messages[msgIdx]!;
            const stableKey = prev.local_echo_key ?? prev.id;
            const merged = withPendingLinkPreviewsIfPersisted(
              mergeMessagePreservingLinkPreview(
                withOutgoingDeliveryStatus({ ...msg, local_echo_key: stableKey }),
                prev,
              ),
            );
            const queue = [...state.pendingOutgoingEchoKeys];
            queue.splice(qi, 1);
            const updated = [...state.messages];
            updated[msgIdx] = merged;
            idbRef.current = { kind: "mergeReplace", removeId: prev.id, message: merged };
            return { messages: updated, pendingOutgoingEchoKeys: queue };
          }
        }
      }

      if (msg.id < 0 && msg.delivery_status === "failed") {
        const echoKey = msg.local_echo_key ?? msg.id;
        const nextQueue = state.pendingOutgoingEchoKeys.filter((k) => k !== echoKey);
        const idx = state.messages.findIndex((m) => m.id === msg.id);
        if (idx >= 0) {
          const updated = [...state.messages];
          updated[idx] = msg;
          return { messages: updated, pendingOutgoingEchoKeys: nextQueue };
        }
        return {
          messages: [...state.messages, msg],
          pendingOutgoingEchoKeys: nextQueue,
        };
      }

      if (msg.id < 0 && msg.delivery_status === "sending") {
        const echoKey = msg.local_echo_key ?? msg.id;
        const idx = state.messages.findIndex((m) => m.id === msg.id);
        if (idx >= 0) {
          const updated = [...state.messages];
          updated[idx] = msg;
          return { messages: updated };
        }
        return {
          messages: [...state.messages, msg],
          pendingOutgoingEchoKeys: [...state.pendingOutgoingEchoKeys, echoKey],
        };
      }

      const normalizedMsg = withPendingLinkPreviewsIfPersisted(msg);

      const idx = state.messages.findIndex((m) => m.id === normalizedMsg.id);
      if (idx >= 0) {
        const updated = [...state.messages];
        updated[idx] = normalizedMsg;
        idbRef.current =
          normalizedMsg.id < 0 ? { kind: "none" } : { kind: "put", message: normalizedMsg };
        return { messages: updated };
      }
      idbRef.current =
        normalizedMsg.id < 0 ? { kind: "none" } : { kind: "put", message: normalizedMsg };
      return { messages: [...state.messages, normalizedMsg] };
    });

    const state = get();
    if (!state.context || !persistChatMessagesToIndexedDb()) return;
    const inst = getCurrentInstance()?.id;
    if (!inst) return;
    const idbPlan = idbRef.current;
    if (idbPlan.kind === "put") {
      void putSingleMessage({
        instanceId: inst,
        chatKey: resolvePersistChatKeyForMessage(state.context, idbPlan.message),
        message: idbPlan.message,
        windowSizeN: zulipMessageCacheWindowN(state.context),
      });
    } else if (idbPlan.kind === "mergeReplace") {
      if (idbPlan.removeId < 0) {
        void deleteMessagesByIds(inst, [idbPlan.removeId]);
      }
      void putSingleMessage({
        instanceId: inst,
        chatKey: resolvePersistChatKeyForMessage(state.context, idbPlan.message),
        message: idbPlan.message,
        windowSizeN: zulipMessageCacheWindowN(state.context),
      });
    }
  },

  commitOutgoingMessage(optimisticId, finalMessage) {
    const idbRef: {
      current:
        | { kind: "none" }
        | { kind: "sync"; deleteNegativeId: number | null; message: MockMessage };
    } = { current: { kind: "none" } };

    set((state) => {
      const nextQueue = state.pendingOutgoingEchoKeys.filter((k) => k !== optimisticId);
      const delivered = withOutgoingDeliveryStatus(finalMessage);
      const optIdx = state.messages.findIndex(
        (m) => m.id === optimisticId || m.local_echo_key === optimisticId,
      );
      const realIdx = state.messages.findIndex((m) => m.id === finalMessage.id);

      if (optIdx >= 0 && realIdx >= 0 && optIdx !== realIdx) {
        const optimistic = state.messages[optIdx]!;
        const echoKey = optimistic.local_echo_key ?? optimistic.id;
        const updated = [...state.messages];
        updated.splice(optIdx, 1);
        const targetIdx = realIdx > optIdx ? realIdx - 1 : realIdx;
        const existingAtTarget = updated[targetIdx];
        const merged = withPendingLinkPreviewsIfPersisted(
          mergeMessagePreservingLinkPreview(
            mergeMessagePreservingLinkPreview(
              { ...delivered, local_echo_key: echoKey },
              optimistic,
            ),
            existingAtTarget,
          ),
        );
        updated[targetIdx] = merged;
        idbRef.current = {
          kind: "sync",
          deleteNegativeId: optimistic.id < 0 ? optimistic.id : null,
          message: merged,
        };
        return { messages: updated, pendingOutgoingEchoKeys: nextQueue };
      }

      if (optIdx >= 0) {
        const prev = state.messages[optIdx]!;
        const echoKey = prev.local_echo_key ?? prev.id;
        const merged = withPendingLinkPreviewsIfPersisted(
          mergeMessagePreservingLinkPreview({ ...delivered, local_echo_key: echoKey }, prev),
        );
        const updated = [...state.messages];
        updated[optIdx] = merged;
        idbRef.current = {
          kind: "sync",
          deleteNegativeId: prev.id < 0 ? prev.id : null,
          message: merged,
        };
        return { messages: updated, pendingOutgoingEchoKeys: nextQueue };
      }

      if (realIdx >= 0) {
        const prev = state.messages[realIdx]!;
        const echoKey = prev.local_echo_key ?? optimisticId;
        const merged = withPendingLinkPreviewsIfPersisted(
          mergeMessagePreservingLinkPreview({ ...delivered, local_echo_key: echoKey }, prev),
        );
        const updated = [...state.messages];
        updated[realIdx] = merged;
        idbRef.current = { kind: "sync", deleteNegativeId: null, message: merged };
        return { messages: updated, pendingOutgoingEchoKeys: nextQueue };
      }

      const merged = withPendingLinkPreviewsIfPersisted({
        ...delivered,
        local_echo_key: optimisticId,
      });
      idbRef.current = { kind: "sync", deleteNegativeId: null, message: merged };
      return {
        messages: [...state.messages, merged],
        pendingOutgoingEchoKeys: nextQueue,
      };
    });

    const idbPlan = idbRef.current;
    if (idbPlan.kind === "none" || !persistChatMessagesToIndexedDb()) return;
    const state = get();
    const inst = getCurrentInstance()?.id;
    if (!state.context || !inst) return;
    if (idbPlan.deleteNegativeId != null && idbPlan.deleteNegativeId < 0) {
      void deleteMessagesByIds(inst, [idbPlan.deleteNegativeId]);
    }
    if (idbPlan.message.id > 0) {
      void putSingleMessage({
        instanceId: inst,
        chatKey: resolvePersistChatKeyForMessage(state.context, idbPlan.message),
        message: idbPlan.message,
        windowSizeN: zulipMessageCacheWindowN(state.context),
      });
    }
  },

  removeMessage(messageId) {
    set((state) => {
      const removed = state.messages.find((m) => m.id === messageId);
      const echoKey =
        removed?.local_echo_key ?? (removed != null && removed.id < 0 ? removed.id : null);
      const nextQueue =
        echoKey != null
          ? state.pendingOutgoingEchoKeys.filter((k) => k !== echoKey)
          : state.pendingOutgoingEchoKeys;
      return {
        messages: state.messages.filter((m) => m.id !== messageId),
        pendingOutgoingEchoKeys: nextQueue,
      };
    });
    if (persistChatMessagesToIndexedDb()) {
      const inst = getCurrentInstance()?.id;
      if (inst) void deleteMessagesByIds(inst, [messageId]);
    }
  },

  removeMessages(messageIds) {
    const ids = new Set(messageIds);
    set((state) => {
      const echoKeysToDrop = new Set<number>();
      for (const m of state.messages) {
        if (!ids.has(m.id)) continue;
        const k = m.local_echo_key ?? (m.id < 0 ? m.id : undefined);
        if (k != null) echoKeysToDrop.add(k);
      }
      const nextQueue =
        echoKeysToDrop.size === 0
          ? state.pendingOutgoingEchoKeys
          : state.pendingOutgoingEchoKeys.filter((k) => !echoKeysToDrop.has(k));
      return {
        messages: state.messages.filter((m) => !ids.has(m.id)),
        pendingOutgoingEchoKeys: nextQueue,
      };
    });
    if (persistChatMessagesToIndexedDb()) {
      const inst = getCurrentInstance()?.id;
      if (inst) void deleteMessagesByIds(inst, messageIds);
    }
  },

  updateMessageReaction(messageId, reaction, op) {
    set((state) => ({
      messages: patchMessageAtId(state.messages, messageId, (m) => {
        const list = m.reactions ?? [];
        const exists = list.some(
          (r) => r.emoji_name === reaction.emoji_name && r.user_id === reaction.user_id,
        );
        if (op === "add") {
          if (exists) return m;
          return { ...m, reactions: [...list, reaction] };
        }
        return {
          ...m,
          reactions: list.filter(
            (r) => !(r.emoji_name === reaction.emoji_name && r.user_id === reaction.user_id),
          ),
        };
      }),
    }));
    const state = get();
    if (!state.context) return;
    if (persistChatMessagesToIndexedDb()) {
      const inst = getCurrentInstance()?.id;
      if (inst) void patchMessageReactionInCache({ instanceId: inst, messageId, reaction, op });
    }
  },

  updateMessageFlags(messageIds, flag, op) {
    const ids = new Set(messageIds);
    set((state) => ({
      messages: patchMessagesFlags(state.messages, ids, flag, op),
    }));
    const state = get();
    if (!state.context) return;
    if (persistChatMessagesToIndexedDb()) {
      const inst = getCurrentInstance()?.id;
      if (inst) void patchMessageFlagsInCache({ instanceId: inst, messageIds, flag, op });
    }
  },

  updateMessageContent(messageId, content, markdownSource) {
    const markdownBody = markdownSource ?? content;
    set((state) => ({
      messages: patchMessageAtId(state.messages, messageId, (m) => {
        const updated = {
          ...m,
          content,
          ...(markdownSource !== undefined ? { markdown_source: markdownSource } : {}),
        };
        return filterMessageLinkPreviewsForMarkdown(updated, markdownBody);
      }),
    }));
    const state = get();
    if (!state.context) return;
    if (persistChatMessagesToIndexedDb()) {
      const inst = getCurrentInstance()?.id;
      if (inst)
        void patchMessageContentInCache({
          instanceId: inst,
          messageId,
          content,
          ...(markdownSource !== undefined ? { markdown_source: markdownSource } : {}),
        });
    }
  },

  updateMessageLinkPreview(messageId, linkPreview) {
    if (linkPreview == null) {
      return;
    }
    set((state) => ({
      messages: patchMessageAtId(state.messages, messageId, (m) =>
        upsertLinkPreviewOnMessage(m, linkPreview),
      ),
    }));
    logStoreAction("message", "updateMessageLinkPreview", {
      messageId,
      hasPreview: linkPreview != null,
    });
    traceLinkPreview("message:update-link-preview", {
      messageId,
      hasPreview: linkPreview != null,
      title: linkPreview?.title,
      targetUrl: linkPreview?.targetUrl,
    });
  },

  moveStreamTopicMessages({ streamId, oldTopic, newTopic, messageIds, anchorMessageId }) {
    if (!Number.isInteger(streamId) || streamId <= 0) return;
    const oldTopicKey = normalizeTopicForIdentity(oldTopic);
    const newTopicKey = normalizeTopicForIdentity(newTopic);
    if (oldTopicKey === newTopicKey) return;
    const targetMessageIds = resolveTopicMoveTargetMessageIds({ messageIds, anchorMessageId });
    if (targetMessageIds.length === 0) return;
    const targetedIds = new Set(targetMessageIds);

    set((state) => {
      let changed = false;
      const nextMessages = state.messages.slice();
      for (let i = 0; i < nextMessages.length; i++) {
        const message = nextMessages[i]!;
        if (!targetedIds.has(message.id)) continue;
        if (message.stream_id !== streamId) continue;
        const topic = normalizeTopicForIdentity(message.subject ?? "");
        if (topic !== oldTopicKey) continue;
        if (message.subject === newTopicKey) continue;
        nextMessages[i] = { ...message, subject: newTopicKey };
        changed = true;
      }

      let nextContext = state.context;
      let contextChanged = false;
      if (
        state.context?.type === "stream" &&
        state.context.streamId === streamId &&
        state.context.streamWideView !== true
      ) {
        const activeTopic = normalizeTopicForIdentity(state.context.topic);
        if (activeTopic === oldTopicKey) {
          nextContext = { ...state.context, topic: newTopicKey };
          contextChanged = true;
        }
      }

      if (!changed && !contextChanged) return state;
      return {
        ...(changed ? { messages: nextMessages } : {}),
        ...(contextChanged ? { context: nextContext } : {}),
      };
    });
  },

  setIsLoadingMore(loading) {
    set({ isLoadingMore: loading });
  },

  setHasOlderMessages(has) {
    set({ hasOlderMessages: has });
  },

  setHasNewerMessages(has) {
    set({ hasNewerMessages: has });
  },

  // Что делает: запускает route-driven initial loader и обновляет store в 2 фазы:
  // cache-first (если есть) и затем authoritative API-снимок.
  async loadInitialMessagesForContext({
    context,
    focusedMessageId,
    currentUserId,
    onCacheHydrated,
    signal,
  }) {
    // Что делает: каждый новый initial-load инвалидирует предыдущий запрос.
    // Зачем: убрать race-condition при быстром переключении между чатами.
    initialLoadGeneration += 1;
    const generation = initialLoadGeneration;
    initialLoadAbortController?.abort();
    const currentController = new AbortController();
    initialLoadAbortController = currentController;
    const cleanupExternalAbort = bindExternalAbortSignal(currentController, signal);
    const effectiveSignal = currentController.signal;

    logMessageFlow("store:loadInitial start", {
      context: summarizeChatContextForLog(context),
      focusedMessageId,
      hasCurrentUserId: currentUserId != null,
      persistIdb: persistChatMessagesToIndexedDb(),
    });

    let loadResult: Awaited<ReturnType<typeof loadInitialMessagesRouteDriven>>;
    try {
      loadResult = await loadInitialMessagesRouteDriven({
        context,
        focusedMessageId,
        currentUserId,
        persistToIndexedDb: persistChatMessagesToIndexedDb(),
        instanceId: getCurrentInstance()?.id ?? null,
        signal: effectiveSignal,
        // Что делает: прокидывает кэшированный payload в store до завершения API.
        // Зачем: UI может показать сообщения сразу и не держать blocking-loader.
        onCacheHydrated: ({ messages, hasOlderMessages, hasNewerMessages }) => {
          if (effectiveSignal.aborted || generation !== initialLoadGeneration) {
            return;
          }
          mergeUsersFromMessages(messages);
          const appliedHasNewerMessages = false;
          logMessageFlow("store:loadInitial idb hydrate before api", {
            chatKey: chatKeyFromContext(context),
            cachedCount: messages.length,
            cacheHasNewerMessages: hasNewerMessages,
            appliedHasNewerMessages,
          });
          set({
            messages,
            pendingOutgoingEchoKeys: [],
            hasOlderMessages,
            hasNewerMessages: appliedHasNewerMessages,
          });
          onCacheHydrated?.();
        },
      });
    } catch (e) {
      if (isAbortLikeError(e) || effectiveSignal.aborted || generation !== initialLoadGeneration) {
        logMessageFlow("store:loadInitial aborted", {
          context: summarizeChatContextForLog(context),
          generation,
        });
        return;
      }
      logMessageFlow("store:loadInitial fetch failed", {
        context: summarizeChatContextForLog(context),
        error: String(e),
      });
      throw e;
    } finally {
      cleanupExternalAbort();
      if (initialLoadAbortController?.signal === effectiveSignal) {
        initialLoadAbortController = null;
      }
    }

    if (effectiveSignal.aborted || generation !== initialLoadGeneration) {
      return;
    }

    logMessageFlow("store:loadInitial api response", {
      context: summarizeChatContextForLog(context),
      messageCount: loadResult.messages.length,
      mode: loadResult.mode,
    });

    const snapshotBeforeApiApply = get();
    mergeUsersFromMessages(loadResult.messages);

    const preserveHydratedOnEmptyApi =
      loadResult.messages.length === 0 &&
      snapshotBeforeApiApply.messages.length > 0 &&
      hydratedMessagesMatchContext(
        snapshotBeforeApiApply.messages,
        loadResult.nextContext,
        currentUserId,
      );

    if (preserveHydratedOnEmptyApi) {
      logMessageFlow("store:loadInitial preserve hydrated on empty api", {
        context: summarizeChatContextForLog(loadResult.nextContext),
        keptCount: snapshotBeforeApiApply.messages.length,
      });
      set({
        context: loadResult.nextContext,
        messages: snapshotBeforeApiApply.messages,
        pendingOutgoingEchoKeys: [],
        hasOlderMessages: snapshotBeforeApiApply.hasOlderMessages,
        hasNewerMessages: snapshotBeforeApiApply.hasNewerMessages,
        boundaryLoadFailed: snapshotBeforeApiApply.boundaryLoadFailed,
      });
      logMessageFlow("store:loadInitial done", {
        mode: loadResult.mode,
        count: snapshotBeforeApiApply.messages.length,
        hasOlder: snapshotBeforeApiApply.hasOlderMessages,
        hasNewer: snapshotBeforeApiApply.hasNewerMessages,
        preserved: true,
      });
      return;
    }

    set({
      context: loadResult.nextContext,
      messages: loadResult.messages,
      pendingOutgoingEchoKeys: [],
      hasOlderMessages: loadResult.hasOlderMessages,
      hasNewerMessages: loadResult.hasNewerMessages,
      boundaryLoadFailed: false,
    });
    logMessageFlow("store:loadInitial done", {
      mode: loadResult.mode,
      count: loadResult.messages.length,
      hasOlder: loadResult.hasOlderMessages,
      hasNewer: loadResult.hasNewerMessages,
    });
  },

  async loadOlderBoundaryPage({ pageSize, currentUserId }) {
    const state = get();
    const ctx = state.context;
    if (state.isLoadingMore || !state.hasOlderMessages || !ctx) {
      logMessageFlow("store:loadOlder gate skip", {
        isLoadingMore: state.isLoadingMore,
        hasOlderMessages: state.hasOlderMessages,
        hasContext: ctx != null,
        context: ctx != null ? summarizeChatContextForLog(ctx) : null,
      });
      return;
    }

    if (state.messages.length === 0) {
      logMessageFlow("store:loadOlder abort empty store", {
        context: summarizeChatContextForLog(ctx),
      });
      loadOlderLog.debug("loadOlder abort: empty store");
      return;
    }
    const oldest = state.messages[0];
    if (!oldest) return;

    const inst = getCurrentInstance()?.id;
    const chatKey = chatKeyFromContext(ctx);
    const isStreamWide = ctx.type === "stream" && ctx.streamWideView === true;

    logMessageFlow("store:loadOlder start", {
      context: summarizeChatContextForLog(ctx),
      anchorOldestId: oldest.id,
      pageSize,
    });
    set({ isLoadingMore: true });
    try {
      const narrow =
        ctx.type === "stream"
          ? ctx.streamWideView
            ? [{ operator: "stream", operand: ctx.streamName }]
            : [
                { operator: "stream", operand: ctx.streamName },
                { operator: "topic", operand: ctx.topic },
              ]
          : [{ operator: "dm", operand: parseDmKeyToUserIds(ctx.dmKey, currentUserId) }];
      const page = await fetchMessagesWithNarrowPage(narrow, oldest.id, pageSize, 0, {
        applyMarkdown: true,
      });
      const withoutAnchor = page.messages.filter((m) => m.id !== oldest.id);
      const existingIds = new Set(get().messages.map((m) => m.id));
      const fresh = withoutAnchor.filter((m) => !existingIds.has(m.id));

      loadOlderLog.debug("loadOlder page", {
        anchorOldest: oldest.id,
        apiRows: page.messages.length,
        withoutAnchor: withoutAnchor.length,
        freshCount: fresh.length,
      });

      if (page.foundOldest && persistChatMessagesToIndexedDb() && inst) {
        if (isStreamWide) {
          await patchPartitionMetaByMessages({
            instanceId: inst,
            currentUserId,
            messages: withoutAnchor,
            patch: { reachedOldest: true },
          });
        } else {
          await updateChatMetaPatch(inst, chatKey, { reachedOldest: true });
        }
      }

      set({
        hasOlderMessages: computeHasOlderAfterLoadOlderIdbPage({
          foundOldest: page.foundOldest,
          withoutAnchorCount: withoutAnchor.length,
          pageSize,
          toUpsertCount: fresh.length,
        }),
      });

      if (fresh.length > 0) {
        mergeUsersFromMessages(fresh);
        set((s) => ({ messages: [...fresh, ...s.messages] }));
        loadOlderLog.info("loadOlder prepended", {
          anchorOldest: oldest.id,
          prepended: fresh.length,
          storeMessagesAfter: get().messages.length,
        });
      }

      if (persistChatMessagesToIndexedDb() && inst && fresh.length > 0) {
        if (isStreamWide) {
          await upsertMessagesByChatPartitions({
            instanceId: inst,
            currentUserId,
            messages: fresh,
          });
        } else {
          const windowN = zulipMessageCacheWindowN(ctx);
          await upsertChatMessages({
            instanceId: inst,
            chatKey,
            messages: fresh,
            windowSizeN: windowN,
          });
        }
      }
      logMessageFlow("store:loadOlder done", {
        context: summarizeChatContextForLog(ctx),
        freshCount: fresh.length,
        foundOldest: page.foundOldest,
        storeLenAfter: get().messages.length,
      });
    } catch (e) {
      logMessageFlow("store:loadOlder failed", { error: String(e) });
      loadOlderLog.warn("loadOlder failed", { error: String(e) });
      set({ boundaryLoadFailed: true });
    } finally {
      set({ isLoadingMore: false });
    }
  },

  async loadNewerBoundaryPage({ pageSize, currentUserId }) {
    const state = get();
    const ctx = state.context;
    if (state.isLoadingMore || !state.hasNewerMessages || !ctx) {
      logMessageFlow("store:loadNewer gate skip", {
        isLoadingMore: state.isLoadingMore,
        hasNewerMessages: state.hasNewerMessages,
        hasContext: ctx != null,
        context: ctx != null ? summarizeChatContextForLog(ctx) : null,
      });
      return;
    }

    if (state.messages.length === 0) {
      logMessageFlow("store:loadNewer abort empty store", {
        context: ctx != null ? summarizeChatContextForLog(ctx) : null,
      });
      return;
    }
    const newest = state.messages[state.messages.length - 1];
    if (!newest) return;

    const inst = getCurrentInstance()?.id;
    const chatKey = chatKeyFromContext(ctx);
    const isStreamWide = ctx.type === "stream" && ctx.streamWideView === true;

    logMessageFlow("store:loadNewer start", {
      context: summarizeChatContextForLog(ctx),
      anchorNewestId: newest.id,
      pageSize,
    });
    set({ isLoadingMore: true, isLoadingNewer: true });
    try {
      const narrow =
        ctx.type === "stream"
          ? ctx.streamWideView
            ? [{ operator: "stream", operand: ctx.streamName }]
            : [
                { operator: "stream", operand: ctx.streamName },
                { operator: "topic", operand: ctx.topic },
              ]
          : [{ operator: "dm", operand: parseDmKeyToUserIds(ctx.dmKey, currentUserId) }];
      const page = await fetchMessagesWithNarrowPage(narrow, newest.id, 0, pageSize, {
        applyMarkdown: true,
      });
      const withoutAnchor = page.messages.filter((m) => m.id !== newest.id);
      const existingIds = new Set(get().messages.map((m) => m.id));
      const fresh = withoutAnchor.filter((m) => !existingIds.has(m.id));

      if (page.foundNewest && persistChatMessagesToIndexedDb() && inst) {
        if (isStreamWide) {
          await patchPartitionMetaByMessages({
            instanceId: inst,
            currentUserId,
            messages: withoutAnchor,
            patch: { reachedNewest: true },
          });
        } else {
          await updateChatMetaPatch(inst, chatKey, { reachedNewest: true });
        }
      }

      set({
        hasNewerMessages: computeHasNewerAfterLoadNewerIdbPage({
          foundNewest: page.foundNewest,
          withoutAnchorCount: withoutAnchor.length,
          pageSize,
          toUpsertCount: fresh.length,
        }),
      });

      if (fresh.length > 0) {
        mergeUsersFromMessages(fresh);
        set((s) => ({ messages: [...s.messages, ...fresh] }));
      }

      if (persistChatMessagesToIndexedDb() && inst && fresh.length > 0) {
        if (isStreamWide) {
          await upsertMessagesByChatPartitions({
            instanceId: inst,
            currentUserId,
            messages: fresh,
          });
        } else {
          const windowN = zulipMessageCacheWindowN(ctx);
          await upsertChatMessages({
            instanceId: inst,
            chatKey,
            messages: fresh,
            windowSizeN: windowN,
          });
        }
      }
      logMessageFlow("store:loadNewer done", {
        context: summarizeChatContextForLog(ctx),
        freshCount: fresh.length,
        foundNewest: page.foundNewest,
        storeLenAfter: get().messages.length,
      });
    } catch (e) {
      logMessageFlow("store:loadNewer failed", { error: String(e) });
      set({ boundaryLoadFailed: true });
    } finally {
      set({ isLoadingMore: false, isLoadingNewer: false });
    }
  },
}));
