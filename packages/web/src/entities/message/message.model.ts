/**
 * Current chat messages store — holds messages for the active chat view.
 *
 * Resets on context (stream/topic or DM) change; updated by real-time events
 * for reactions, flags, content edits, and deletions.
 */
import { create } from "zustand";
import {
  captureActiveOrgRequestContext,
  isActiveOrgRequestContextCurrent,
} from "~/entities/instance/instance.model";
import { useUsersStore } from "~/entities/user/user.model";
import { getCurrentInstance } from "~/shared/api/client";
import type { MessageReactions, MockMessage } from "~/shared/api/messenger.types";
import { createLogger, logStoreAction } from "~/shared/lib/logger";
import { messageAuthorId } from "~/shared/lib/message-author.lib";
import {
  deleteMessagesByIds,
  patchMessageContentInCache,
  patchMessageFlagsInCache,
  replaceMessageReactionsInCache,
  putSingleMessage,
  updateChatMetaPatch,
  upsertChatMessages,
} from "~/shared/lib/message-cache-db";
import { chatKeyFromContext, chatKeyFromMockMessage } from "~/shared/lib/message-cache-keys.lib";
import { logMessageFlow, summarizeChatContextForLog } from "~/shared/lib/message-flow-debug.lib";
import { compareMessageTimeline, type MessageId } from "~/shared/lib/message-id.lib";
import { filterMessageLinkPreviewsForMarkdown } from "~/shared/lib/message-link-preview-filter.lib";
import { upsertLinkPreviewOnMessage } from "~/shared/lib/message-link-preview-list.lib";
import { mergeMessagePreservingLinkPreview } from "~/shared/lib/message-link-preview-merge.lib";
import { applyPendingLinkPreviewsToMessage } from "~/shared/lib/message-link-preview-pending.lib";
import { traceLinkPreview } from "~/shared/lib/message-link-preview-trace.lib";
import {
  computeHasNewerAfterLoadNewerIdbPage,
  resolveHasOlderAfterLoadOlderPage,
  resolveOldestMessageId,
} from "~/shared/lib/message-pagination-boundary.lib";
import { messengerMessageCacheWindowN } from "~/shared/lib/messenger-message-window.lib";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import { resolveTopicMoveTargetMessageIds } from "~/shared/lib/update-message-topic-move.lib";
import type { UserId } from "~/shared/lib/user-id.lib";
import {
  computeAppendMessageStateUpdate,
  type MessageAppendIdbPlan,
} from "./message-append-state.lib";
import {
  patchPartitionMetaByMessages,
  upsertMessagesByChatPartitions,
} from "./message-cache-partition.lib";
import { isSameChatLocation } from "./message-chat-context.lib";
import { fetchChatMessagesPage } from "./message-fetch.lib";
import { loadInitialMessagesRouteDriven } from "./message-initial-loader.lib";
import { persistChatMessagesToIndexedDb } from "./message-local-cache.lib";
import { patchMessageAtId, patchMessagesFlags } from "./message-patch.lib";
import {
  applyMessageReactionSnapshot,
  normalizedMessageReactionsSnapshot,
} from "./message-reaction-update.lib";
import type { CurrentChatContext, CurrentChatMessagesState } from "./message.model.types";

export type { CurrentChatContext } from "./message.model.types";
export { contextFromMessage, isMessageForContext } from "./message-chat-context.lib";

const loadOlderLog = createLogger("messages:loadOlder");

function hydratedMessagesMatchContext(
  messages: readonly MockMessage[],
  next: CurrentChatContext,
  currentUserId: UserId | null,
): boolean {
  if (messages.length === 0) return true;
  if (next.type === "dm") {
    const expected = chatKeyFromContext({ type: "dm", dmKey: next.dmKey });
    return messages.every((m) => chatKeyFromMockMessage(m, currentUserId) === expected);
  }
  if (next.streamWideView) {
    return messages.every((m) => m.stream_uuid === next.streamId);
  }
  const expected = chatKeyFromContext({
    type: "stream",
    streamId: next.streamId,
    topic: next.topic,
  });
  return messages.every((m) => chatKeyFromMockMessage(m, currentUserId) === expected);
}

interface InitialLoadMessageReconciliation {
  observedById: Map<MessageId, MockMessage>;
  preservedById: Map<MessageId, MockMessage>;
  removedIds: Set<MessageId>;
}

function createInitialLoadMessageReconciliation(
  messages: readonly MockMessage[],
): InitialLoadMessageReconciliation {
  return {
    observedById: new Map(messages.map((message) => [message.id, message])),
    preservedById: new Map(),
    removedIds: new Set(),
  };
}

function captureConcurrentInitialLoadChanges(
  reconciliation: InitialLoadMessageReconciliation,
  currentMessages: readonly MockMessage[],
): void {
  const currentById = new Map(currentMessages.map((message) => [message.id, message]));

  for (const messageId of reconciliation.observedById.keys()) {
    if (!currentById.has(messageId)) {
      reconciliation.removedIds.add(messageId);
      reconciliation.preservedById.delete(messageId);
    }
  }

  for (const message of currentMessages) {
    if (reconciliation.observedById.get(message.id) === message) continue;
    reconciliation.preservedById.set(message.id, message);
    reconciliation.removedIds.delete(message.id);
  }
}

function reconcileInitialLoadMessages(options: {
  reconciliation: InitialLoadMessageReconciliation;
  incomingMessages: readonly MockMessage[];
  currentMessages: readonly MockMessage[];
  context: CurrentChatContext;
  currentUserId: UserId | null;
}): MockMessage[] {
  const { reconciliation, incomingMessages, currentMessages, context, currentUserId } = options;
  captureConcurrentInitialLoadChanges(reconciliation, currentMessages);

  const mergedById = new Map<MessageId, MockMessage>();
  for (const message of incomingMessages) {
    if (!reconciliation.removedIds.has(message.id)) {
      mergedById.set(message.id, message);
    }
  }
  for (const message of reconciliation.preservedById.values()) {
    if (!hydratedMessagesMatchContext([message], context, currentUserId)) continue;
    mergedById.set(
      message.id,
      mergeMessagePreservingLinkPreview(message, mergedById.get(message.id)),
    );
  }

  const reconciled = Array.from(mergedById.values()).sort(compareMessageTimeline);
  reconciliation.observedById = new Map(reconciled.map((message) => [message.id, message]));
  return reconciled;
}

// Stale initial-load responses must not mutate store state after a newer chat is selected.
let initialLoadGeneration = 0;

// Abort the in-flight refresh when the user switches chats before the network round-trip finishes.
let initialLoadAbortController: AbortController | null = null;
let boundaryLoadAbortController: AbortController | null = null;

function isAbortLikeError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

// UI effect cleanup must abort the same in-flight request the store owns.
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

function abortBoundaryLoad(): void {
  boundaryLoadAbortController?.abort();
  boundaryLoadAbortController = null;
}

function isCurrentChatRequest(
  get: () => CurrentChatMessagesState,
  context: CurrentChatContext,
): boolean {
  return isSameChatLocation(get().context, context);
}

function mergeUsersFromMessages(messages: readonly MockMessage[]): void {
  const store = useUsersStore.getState();
  for (const msg of messages) {
    store.mergeUser({
      user_id: messageAuthorId(msg),
      full_name: msg.sender_full_name ?? "",
    });
  }
}

function withOutgoingDeliveryStatus(message: MockMessage): MockMessage {
  return { ...message, delivery_status: "sent" };
}

function shouldPersistMessage(message: MockMessage): boolean {
  return message.delivery_status !== "sending" && message.delivery_status !== "failed";
}

function withPendingLinkPreviewsIfPersisted(message: MockMessage): MockMessage {
  return shouldPersistMessage(message) ? applyPendingLinkPreviewsToMessage(message) : message;
}

function clearMessageEditState(message: MockMessage): MockMessage {
  const next = { ...message };
  delete next.edit_status;
  delete next.pending_edit_markdown;
  delete next.previous_content;
  delete next.previous_markdown_source;
  delete next.edit_error;
  return next;
}

function applyOptimisticEditToMessage(message: MockMessage, markdown: string): MockMessage {
  const firstOptimisticEdit = message.previous_content === undefined;
  const next: MockMessage = {
    ...message,
    content: markdown,
    markdown_source: markdown,
    edit_status: "saving",
    pending_edit_markdown: markdown,
    previous_content: firstOptimisticEdit ? message.content : message.previous_content,
  };
  if (firstOptimisticEdit) {
    if (message.markdown_source !== undefined) {
      next.previous_markdown_source = message.markdown_source;
    }
  } else if (message.previous_markdown_source !== undefined) {
    next.previous_markdown_source = message.previous_markdown_source;
  }
  delete next.edit_error;
  return filterMessageLinkPreviewsForMarkdown(next, markdown);
}

function failOptimisticEditOnMessage(message: MockMessage, error: string): MockMessage {
  return {
    ...message,
    edit_status: "failed",
    edit_error: error,
  };
}

function cancelFailedEditOnMessage(message: MockMessage): MockMessage {
  if (message.previous_content === undefined) {
    return clearMessageEditState(message);
  }
  const restored = clearMessageEditState({
    ...message,
    content: message.previous_content,
    ...(message.previous_markdown_source !== undefined
      ? { markdown_source: message.previous_markdown_source }
      : {}),
  });
  if (message.previous_markdown_source === undefined) {
    delete restored.markdown_source;
  }
  return filterMessageLinkPreviewsForMarkdown(
    restored,
    restored.markdown_source ?? restored.content,
  );
}

function commitOptimisticEditOnMessage(
  message: MockMessage,
  serverMessage: MockMessage | null | undefined,
): MockMessage {
  const content = serverMessage?.content ?? message.content;
  const markdownSource = serverMessage?.markdown_source ?? message.markdown_source;
  const next = clearMessageEditState({
    ...message,
    content,
    ...(markdownSource !== undefined ? { markdown_source: markdownSource } : {}),
  });
  return filterMessageLinkPreviewsForMarkdown(next, markdownSource ?? content);
}

function persistMessageContent(
  messageId: MessageId,
  content: string,
  markdownSource?: string,
): void {
  if (!persistChatMessagesToIndexedDb()) return;
  const inst = getCurrentInstance()?.id;
  if (!inst) return;
  void patchMessageContentInCache({
    instanceId: inst,
    messageId,
    content,
    ...(markdownSource !== undefined ? { markdown_source: markdownSource } : {}),
  });
}

function schedulePersistFullChatMessages(get: () => CurrentChatMessagesState): void {
  if (!persistChatMessagesToIndexedDb()) return;
  const inst = getCurrentInstance()?.id;
  const ctx = get().context;
  const msgs = get().messages;
  if (!inst || !ctx || msgs.length === 0) return;
  // Wide stream view must not collapse all topics into one default partition key.
  if (ctx.type === "stream" && ctx.streamWideView) {
    void upsertMessagesByChatPartitions({
      instanceId: inst,
      currentUserId: null,
      messages: msgs,
    });
    return;
  }
  const windowN = messengerMessageCacheWindowN(ctx);
  void upsertChatMessages({
    instanceId: inst,
    chatKey: chatKeyFromContext(ctx),
    messages: msgs,
    windowSizeN: windowN,
  });
}

// Wide context still persists each message under its actual topic partition key.
function resolvePersistChatKeyForMessage(
  context: CurrentChatContext,
  message: MockMessage,
): string {
  if (context.type === "stream" && context.streamWideView) {
    return chatKeyFromContext({
      type: "stream",
      streamId: context.streamId,
      topic: normalizeTopicForIdentity(message.topic_uuid ?? message.subject ?? ""),
    });
  }
  return chatKeyFromContext(context);
}

interface BoundaryPersistenceOptions {
  instanceId: string | undefined;
  currentUserId: UserId | null;
  context: CurrentChatContext;
  messages: readonly MockMessage[];
  isRequestCurrent: () => boolean;
}

async function persistReachedBoundary(
  options: BoundaryPersistenceOptions & {
    reachedBoundary: boolean;
    boundary: "oldest" | "newest";
  },
): Promise<void> {
  const {
    instanceId,
    currentUserId,
    context,
    messages,
    isRequestCurrent,
    reachedBoundary,
    boundary,
  } = options;
  if (
    !reachedBoundary ||
    !persistChatMessagesToIndexedDb() ||
    instanceId == null ||
    !isRequestCurrent()
  ) {
    return;
  }
  const patch = boundary === "oldest" ? { reachedOldest: true } : { reachedNewest: true };
  if (context.type === "stream" && context.streamWideView === true) {
    await patchPartitionMetaByMessages({
      instanceId,
      currentUserId,
      messages,
      patch,
    });
    return;
  }
  await updateChatMetaPatch(instanceId, chatKeyFromContext(context), patch);
}

async function persistFreshBoundaryMessages(options: BoundaryPersistenceOptions): Promise<void> {
  const { instanceId, currentUserId, context, messages, isRequestCurrent } = options;
  if (
    !persistChatMessagesToIndexedDb() ||
    instanceId == null ||
    messages.length === 0 ||
    !isRequestCurrent()
  ) {
    return;
  }
  if (context.type === "stream" && context.streamWideView === true) {
    await upsertMessagesByChatPartitions({
      instanceId,
      currentUserId,
      messages,
    });
    return;
  }
  await upsertChatMessages({
    instanceId,
    chatKey: chatKeyFromContext(context),
    messages,
    windowSizeN: messengerMessageCacheWindowN(context),
  });
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
  initialLoadError: null,

  clearBoundaryLoadFailed() {
    set({ boundaryLoadFailed: false });
  },

  clearInitialLoadError() {
    set({ initialLoadError: null });
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
      if (context.topicUuid != null) {
        nextContext.topicUuid = context.topicUuid;
      } else {
        delete nextContext.topicUuid;
      }
    }

    if (isSameChatLocation(prev, nextContext)) {
      if (
        prev != null &&
        nextContext != null &&
        prev.type === "stream" &&
        nextContext.type === "stream" &&
        (prev.streamName !== nextContext.streamName ||
          prev.topic !== nextContext.topic ||
          prev.topicUuid !== nextContext.topicUuid ||
          prev.streamWideView !== nextContext.streamWideView)
      ) {
        const updatedContext = {
          ...prev,
          streamName: nextContext.streamName,
          topic: nextContext.topic,
          streamWideView: nextContext.streamWideView,
        };
        if (nextContext.topicUuid != null) {
          updatedContext.topicUuid = nextContext.topicUuid;
        } else {
          delete updatedContext.topicUuid;
        }
        set({
          context: updatedContext,
        });
      }
      return;
    }

    abortBoundaryLoad();

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
      initialLoadError: null,
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
    const idbRef: { current: MessageAppendIdbPlan } = { current: { kind: "none" } };

    set((state) => computeAppendMessageStateUpdate(state, msg, idbRef));

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
        windowSizeN: messengerMessageCacheWindowN(state.context),
      });
    } else if (idbPlan.kind === "mergeReplace") {
      void deleteMessagesByIds(inst, [idbPlan.removeId]);
      void putSingleMessage({
        instanceId: inst,
        chatKey: resolvePersistChatKeyForMessage(state.context, idbPlan.message),
        message: idbPlan.message,
        windowSizeN: messengerMessageCacheWindowN(state.context),
      });
    }
  },

  commitOutgoingMessage(optimisticId, finalMessage) {
    const idbRef: {
      current:
        | { kind: "none" }
        | { kind: "sync"; deleteOptimisticId: MessageId | null; message: MockMessage };
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
          deleteOptimisticId: optimistic.id,
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
          deleteOptimisticId: prev.id,
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
        idbRef.current = { kind: "sync", deleteOptimisticId: null, message: merged };
        return { messages: updated, pendingOutgoingEchoKeys: nextQueue };
      }

      const merged = withPendingLinkPreviewsIfPersisted({
        ...delivered,
        local_echo_key: optimisticId,
      });
      idbRef.current = { kind: "sync", deleteOptimisticId: null, message: merged };
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
    if (idbPlan.deleteOptimisticId != null) {
      void deleteMessagesByIds(inst, [idbPlan.deleteOptimisticId]);
    }
    if (shouldPersistMessage(idbPlan.message)) {
      void putSingleMessage({
        instanceId: inst,
        chatKey: resolvePersistChatKeyForMessage(state.context, idbPlan.message),
        message: idbPlan.message,
        windowSizeN: messengerMessageCacheWindowN(state.context),
      });
    }
  },

  removeMessage(messageId) {
    set((state) => {
      const removed = state.messages.find((m) => m.id === messageId);
      const echoKey =
        removed?.local_echo_key ?? (removed?.delivery_status === "sending" ? removed.id : null);
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
      const echoKeysToDrop = new Set<MessageId>();
      for (const m of state.messages) {
        if (!ids.has(m.id)) continue;
        const k = m.local_echo_key ?? (m.delivery_status === "sending" ? m.id : undefined);
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

  replaceMessageReactions(messageId: MessageId, reactions: MessageReactions) {
    const nextReactions = normalizedMessageReactionsSnapshot(reactions);
    set((state) => ({
      messages: patchMessageAtId(state.messages, messageId, (m) =>
        applyMessageReactionSnapshot(m, nextReactions),
      ),
    }));
    const state = get();
    if (!state.context) return;
    if (persistChatMessagesToIndexedDb()) {
      const inst = getCurrentInstance()?.id;
      if (inst) {
        void replaceMessageReactionsInCache({
          instanceId: inst,
          messageId,
          reactions: nextReactions,
        });
      }
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
        const updated = clearMessageEditState({
          ...m,
          content,
          ...(markdownSource !== undefined ? { markdown_source: markdownSource } : {}),
        });
        return filterMessageLinkPreviewsForMarkdown(updated, markdownBody);
      }),
    }));
    const state = get();
    if (!state.context) return;
    persistMessageContent(messageId, content, markdownSource);
  },

  updateMessageSource(messageId, sourceName, source) {
    if (sourceName == null && source == null) return;
    set((state) => ({
      messages: patchMessageAtId(state.messages, messageId, (message) => ({
        ...message,
        ...(sourceName != null ? { source_name: sourceName } : {}),
        ...(source != null ? { source } : {}),
      })),
    }));
    logStoreAction("message", "updateMessageSource", { messageId, sourceName });
  },

  updateMessageProviderDelivery(messageId, provider, delivery) {
    if (provider === undefined && delivery === undefined) return;
    set((state) => ({
      messages: patchMessageAtId(state.messages, messageId, (message) => ({
        ...message,
        ...(provider !== undefined ? { provider } : {}),
        ...(delivery !== undefined ? { delivery } : {}),
      })),
    }));
    logStoreAction("message", "updateMessageProviderDelivery", {
      messageId,
      providerKind: provider?.kind,
      deliveryStatus: delivery?.status,
    });
  },

  applyOptimisticMessageEdit(messageId, markdown) {
    set((state) => ({
      messages: patchMessageAtId(state.messages, messageId, (m) =>
        applyOptimisticEditToMessage(m, markdown),
      ),
    }));
    logStoreAction("message", "applyOptimisticMessageEdit", { messageId });
  },

  commitOptimisticMessageEdit(messageId, serverMessage) {
    set((state) => ({
      messages: patchMessageAtId(state.messages, messageId, (m) =>
        commitOptimisticEditOnMessage(m, serverMessage),
      ),
    }));
    const message = get().messages.find((candidate) => candidate.id === messageId);
    if (message != null) {
      persistMessageContent(messageId, message.content, message.markdown_source);
    }
    logStoreAction("message", "commitOptimisticMessageEdit", {
      messageId,
      hasServerMessage: serverMessage != null,
    });
  },

  failOptimisticMessageEdit(messageId, error) {
    set((state) => ({
      messages: patchMessageAtId(state.messages, messageId, (m) =>
        failOptimisticEditOnMessage(m, error),
      ),
    }));
    logStoreAction("message", "failOptimisticMessageEdit", { messageId });
  },

  cancelFailedMessageEdit(messageId) {
    set((state) => ({
      messages: patchMessageAtId(state.messages, messageId, cancelFailedEditOnMessage),
    }));
    logStoreAction("message", "cancelFailedMessageEdit", { messageId });
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
    if (streamId.trim().length === 0) return;
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
        if (message.stream_uuid !== streamId) continue;
        const topic = normalizeTopicForIdentity(message.topic_uuid ?? message.subject ?? "");
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

  moveTopicToStreamMessages({
    sourceStreamId,
    targetStreamId,
    targetStreamName,
    oldTopic,
    newTopic,
    messageIds,
    anchorMessageId,
  }) {
    if (sourceStreamId.trim().length === 0) return;
    if (targetStreamId.trim().length === 0) return;
    const oldTopicKey = normalizeTopicForIdentity(oldTopic);
    const newTopicKey = normalizeTopicForIdentity(newTopic);
    const targetMessageIds = resolveTopicMoveTargetMessageIds({ messageIds, anchorMessageId });
    if (targetMessageIds.length === 0) return;
    const targetedIds = new Set(targetMessageIds);

    set((state) => {
      let changed = false;
      const nextMessages = state.messages.slice();
      for (let i = 0; i < nextMessages.length; i++) {
        const message = nextMessages[i]!;
        if (!targetedIds.has(message.id)) continue;
        if (message.stream_uuid !== sourceStreamId) continue;
        const topic = normalizeTopicForIdentity(message.topic_uuid ?? message.subject ?? "");
        if (topic !== oldTopicKey) continue;
        nextMessages[i] = {
          ...message,
          stream_uuid: targetStreamId,
          subject: newTopicKey,
          channel: targetStreamName,
        };
        changed = true;
      }

      let nextContext = state.context;
      let contextChanged = false;
      if (
        state.context?.type === "stream" &&
        state.context.streamId === sourceStreamId &&
        state.context.streamWideView !== true
      ) {
        const activeTopic = normalizeTopicForIdentity(state.context.topic);
        if (activeTopic === oldTopicKey) {
          nextContext = {
            ...state.context,
            streamId: targetStreamId,
            streamName: targetStreamName,
            topic: newTopicKey,
          };
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

  async loadInitialMessagesForContext({
    context,
    focusedMessageId,
    currentUserId,
    onCacheHydrated,
    onDmMessagesApplied,
    onStreamMessagesApplied,
    signal,
  }) {
    // Bump generation so stale responses from a prior chat cannot apply after fast route switches.
    initialLoadGeneration += 1;
    const generation = initialLoadGeneration;
    initialLoadAbortController?.abort();
    const currentController = new AbortController();
    initialLoadAbortController = currentController;
    const cleanupExternalAbort = bindExternalAbortSignal(currentController, signal);
    const effectiveSignal = currentController.signal;
    const reconciliation = createInitialLoadMessageReconciliation(get().messages);

    logMessageFlow("store:loadInitial start", {
      context: summarizeChatContextForLog(context),
      focusedMessageId,
      hasCurrentUserId: currentUserId != null,
      persistIdb: persistChatMessagesToIndexedDb(),
    });
    set({ initialLoadError: null });

    let loadResult: Awaited<ReturnType<typeof loadInitialMessagesRouteDriven>>;
    try {
      loadResult = await loadInitialMessagesRouteDriven({
        context,
        focusedMessageId,
        currentUserId,
        persistToIndexedDb: persistChatMessagesToIndexedDb(),
        instanceId: getCurrentInstance()?.id ?? null,
        signal: effectiveSignal,
        onCacheHydrated: ({ messages, hasOlderMessages, hasNewerMessages }) => {
          if (effectiveSignal.aborted || generation !== initialLoadGeneration) {
            return;
          }
          const snapshotBeforeCacheApply = get();
          const reconciledMessages = reconcileInitialLoadMessages({
            reconciliation,
            incomingMessages: messages,
            currentMessages: snapshotBeforeCacheApply.messages,
            context,
            currentUserId,
          });
          mergeUsersFromMessages(reconciledMessages);
          const appliedHasNewerMessages = false;
          logMessageFlow("store:loadInitial idb hydrate before api", {
            chatKey: chatKeyFromContext(context),
            cachedCount: messages.length,
            reconciledCount: reconciledMessages.length,
            cacheHasNewerMessages: hasNewerMessages,
            appliedHasNewerMessages,
          });
          set({
            messages: reconciledMessages,
            pendingOutgoingEchoKeys: snapshotBeforeCacheApply.pendingOutgoingEchoKeys,
            hasOlderMessages,
            hasNewerMessages: appliedHasNewerMessages,
          });
          onCacheHydrated?.();
          if (context.type === "dm") {
            onDmMessagesApplied?.({
              messages: reconciledMessages,
              context,
              hasNewerMessages,
              focusedMessageId,
              source: "cache",
            });
          }
          if (context.type === "stream") {
            onStreamMessagesApplied?.({
              messages: reconciledMessages,
              context: { type: "stream", streamId: context.streamId },
              hasNewerMessages,
              focusedMessageId,
              source: "cache",
            });
          }
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
      set({ initialLoadError: String(e) });
      return;
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
    const reconciledMessages = reconcileInitialLoadMessages({
      reconciliation,
      incomingMessages: loadResult.messages,
      currentMessages: snapshotBeforeApiApply.messages,
      context: loadResult.nextContext,
      currentUserId,
    });

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
        pendingOutgoingEchoKeys: snapshotBeforeApiApply.pendingOutgoingEchoKeys,
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
      if (loadResult.nextContext.type === "dm") {
        onDmMessagesApplied?.({
          messages: snapshotBeforeApiApply.messages,
          context: loadResult.nextContext,
          hasNewerMessages: snapshotBeforeApiApply.hasNewerMessages,
          focusedMessageId,
          source: "api",
        });
      }
      if (loadResult.nextContext.type === "stream") {
        onStreamMessagesApplied?.({
          messages: snapshotBeforeApiApply.messages,
          context: { type: "stream", streamId: loadResult.nextContext.streamId },
          hasNewerMessages: snapshotBeforeApiApply.hasNewerMessages,
          focusedMessageId,
          source: "api",
        });
      }
      return;
    }

    set({
      context: loadResult.nextContext,
      messages: reconciledMessages,
      pendingOutgoingEchoKeys: snapshotBeforeApiApply.pendingOutgoingEchoKeys,
      hasOlderMessages: loadResult.hasOlderMessages,
      hasNewerMessages: loadResult.hasNewerMessages,
      boundaryLoadFailed: false,
    });
    logMessageFlow("store:loadInitial done", {
      mode: loadResult.mode,
      count: reconciledMessages.length,
      hasOlder: loadResult.hasOlderMessages,
      hasNewer: loadResult.hasNewerMessages,
    });
    if (loadResult.nextContext.type === "dm") {
      onDmMessagesApplied?.({
        messages: reconciledMessages,
        context: loadResult.nextContext,
        hasNewerMessages: loadResult.hasNewerMessages,
        focusedMessageId,
        source: "api",
      });
    }
    if (loadResult.nextContext.type === "stream") {
      onStreamMessagesApplied?.({
        messages: reconciledMessages,
        context: { type: "stream", streamId: loadResult.nextContext.streamId },
        hasNewerMessages: loadResult.hasNewerMessages,
        focusedMessageId,
        source: "api",
      });
    }
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
    const anchorOldestId = resolveOldestMessageId(state.messages);
    if (anchorOldestId == null) return;

    abortBoundaryLoad();
    const controller = new AbortController();
    boundaryLoadAbortController = controller;
    const orgContext = captureActiveOrgRequestContext();
    const inst = getCurrentInstance()?.id;
    const isRequestCurrent = () =>
      boundaryLoadAbortController === controller &&
      isActiveOrgRequestContextCurrent(orgContext) &&
      isCurrentChatRequest(get, ctx);

    logMessageFlow("store:loadOlder start", {
      context: summarizeChatContextForLog(ctx),
      anchorOldestId,
      pageSize,
    });
    set({ isLoadingMore: true });
    try {
      const page = await fetchChatMessagesPage({
        context: ctx,
        currentUserId,
        anchor: anchorOldestId,
        numBefore: pageSize,
        numAfter: 0,
        signal: controller.signal,
      });
      if (!isRequestCurrent()) {
        return;
      }
      const withoutAnchor = page.messages.filter((m) => m.id !== anchorOldestId);
      const existingIds = new Set(get().messages.map((m) => m.id));
      const fresh = withoutAnchor.filter((m) => !existingIds.has(m.id));

      loadOlderLog.debug("loadOlder page", {
        anchorOldest: anchorOldestId,
        apiRows: page.messages.length,
        withoutAnchor: withoutAnchor.length,
        freshCount: fresh.length,
      });

      const hasOlderMessages = resolveHasOlderAfterLoadOlderPage({
        foundOldest: page.foundOldest,
        withoutAnchorCount: withoutAnchor.length,
        pageSize,
        toUpsertCount: fresh.length,
      });
      if (!hasOlderMessages && fresh.length === 0 && withoutAnchor.length >= pageSize) {
        loadOlderLog.warn("loadOlder stopped: full duplicate page with no store progress", {
          anchorOldestId,
          pageSize,
        });
      }

      await persistReachedBoundary({
        instanceId: inst,
        currentUserId,
        context: ctx,
        messages: withoutAnchor,
        isRequestCurrent,
        reachedBoundary: page.foundOldest,
        boundary: "oldest",
      });
      if (!isRequestCurrent()) {
        return;
      }

      set({ hasOlderMessages });

      if (fresh.length > 0) {
        mergeUsersFromMessages(fresh);
        set((s) => ({ messages: [...fresh, ...s.messages] }));
        loadOlderLog.info("loadOlder prepended", {
          anchorOldest: anchorOldestId,
          prepended: fresh.length,
          storeMessagesAfter: get().messages.length,
        });
      }

      await persistFreshBoundaryMessages({
        instanceId: inst,
        currentUserId,
        context: ctx,
        messages: fresh,
        isRequestCurrent,
      });
      if (!isRequestCurrent()) {
        return;
      }
      logMessageFlow("store:loadOlder done", {
        context: summarizeChatContextForLog(ctx),
        freshCount: fresh.length,
        foundOldest: page.foundOldest,
        storeLenAfter: get().messages.length,
      });
    } catch (e) {
      if (isAbortLikeError(e) || controller.signal.aborted || !isRequestCurrent()) {
        return;
      }
      logMessageFlow("store:loadOlder failed", { error: String(e) });
      loadOlderLog.warn("loadOlder failed", { error: String(e) });
      set({ boundaryLoadFailed: true });
    } finally {
      if (boundaryLoadAbortController === controller) {
        boundaryLoadAbortController = null;
        set({ isLoadingMore: false });
      }
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

    abortBoundaryLoad();
    const controller = new AbortController();
    boundaryLoadAbortController = controller;
    const orgContext = captureActiveOrgRequestContext();
    const inst = getCurrentInstance()?.id;
    const isRequestCurrent = () =>
      boundaryLoadAbortController === controller &&
      isActiveOrgRequestContextCurrent(orgContext) &&
      isCurrentChatRequest(get, ctx);

    logMessageFlow("store:loadNewer start", {
      context: summarizeChatContextForLog(ctx),
      anchorNewestId: newest.id,
      pageSize,
    });
    set({ isLoadingMore: true, isLoadingNewer: true });
    try {
      const page = await fetchChatMessagesPage({
        context: ctx,
        currentUserId,
        anchor: newest.id,
        numBefore: 0,
        numAfter: pageSize,
        signal: controller.signal,
      });
      if (!isRequestCurrent()) {
        return;
      }
      const withoutAnchor = page.messages.filter((m) => m.id !== newest.id);
      const existingIds = new Set(get().messages.map((m) => m.id));
      const fresh = withoutAnchor.filter((m) => !existingIds.has(m.id));

      await persistReachedBoundary({
        instanceId: inst,
        currentUserId,
        context: ctx,
        messages: withoutAnchor,
        isRequestCurrent,
        reachedBoundary: page.foundNewest,
        boundary: "newest",
      });
      if (!isRequestCurrent()) {
        return;
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

      await persistFreshBoundaryMessages({
        instanceId: inst,
        currentUserId,
        context: ctx,
        messages: fresh,
        isRequestCurrent,
      });
      if (!isRequestCurrent()) {
        return;
      }
      logMessageFlow("store:loadNewer done", {
        context: summarizeChatContextForLog(ctx),
        freshCount: fresh.length,
        foundNewest: page.foundNewest,
        storeLenAfter: get().messages.length,
      });
    } catch (e) {
      if (isAbortLikeError(e) || controller.signal.aborted || !isRequestCurrent()) {
        return;
      }
      logMessageFlow("store:loadNewer failed", { error: String(e) });
      set({ boundaryLoadFailed: true });
    } finally {
      if (boundaryLoadAbortController === controller) {
        boundaryLoadAbortController = null;
        set({ isLoadingMore: false, isLoadingNewer: false });
      }
    }
  },
}));
