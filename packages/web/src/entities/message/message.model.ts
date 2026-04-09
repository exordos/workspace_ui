/**
 * Current chat messages store — holds messages for the active chat view.
 *
 * Resets on context (stream/topic or DM) change; updated by real-time events
 * for reactions, flags, content edits, and deletions.
 */
import { create } from "zustand";
import { useUsersStore } from "~/entities/user/user.model";
import { getCurrentInstance } from "~/shared/api/client";
import {
  fetchDmMessages,
  fetchMessages,
  fetchMessagesWithNarrow,
  fetchMessagesWithNarrowPage,
} from "~/shared/api/zulip";
import type { MockMessage, Reaction } from "~/shared/api/zulip.types";
import {
  deleteMessagesByIds,
  getChatMessagesAscending,
  getChatMeta,
  patchMessageContentInCache,
  patchMessageFlagsInCache,
  patchMessageReactionInCache,
  putSingleMessage,
  updateChatMetaPatch,
  upsertChatMessages,
} from "~/shared/lib/message-cache-db";
import {
  logMessageFlow,
  summarizeChatContextForLog,
} from "~/shared/lib/message-flow-debug.lib";
import { createLogger } from "~/shared/lib/logger";
import {
  computeHasNewerAfterLoadNewerIdbPage,
  computeHasOlderAfterLoadOlderIdbPage,
} from "~/shared/lib/message-pagination-boundary.lib";
import { chatKeyFromContext, chatKeyFromMockMessage } from "~/shared/lib/message-cache-keys.lib";
import { zulipMessageCacheWindowN } from "~/shared/lib/zulip-message-window.lib";
import { outgoingEchoContentMatches } from "./message-outgoing-echo.lib";
import { parseDmKeyToUserIds } from "./message-chat-context.lib";
import { persistChatMessagesToIndexedDb } from "./message-local-cache.lib";
import { deriveFocusedPaginationFlags } from "./message-pagination-helpers.lib";
import type { CurrentChatContext, CurrentChatMessagesState } from "./message.model.types";

export type { CurrentChatContext } from "./message.model.types";
export { contextFromMessage, isMessageForContext } from "./message-chat-context.lib";

const loadOlderLog = createLogger("messages:loadOlder");

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

function schedulePersistFullChatMessages(get: () => CurrentChatMessagesState): void {
  if (!persistChatMessagesToIndexedDb()) return;
  const inst = getCurrentInstance()?.id;
  const ctx = get().context;
  const msgs = get().messages;
  if (!inst || !ctx || msgs.length === 0) return;
  const windowN = zulipMessageCacheWindowN(ctx);
  void upsertChatMessages({
    instanceId: inst,
    chatKey: chatKeyFromContext(ctx),
    messages: msgs,
    windowSizeN: windowN,
  });
}

export const useCurrentChatMessagesStore = create<CurrentChatMessagesState>((set, get) => ({
  context: null,
  messages: [],
  pendingOutgoingEchoKeys: [],
  isLoadingMore: false,
  hasOlderMessages: true,
  hasNewerMessages: false,

  setContext(context) {
    const prev = get().context;
    const cachedMessages: MockMessage[] = [];

    let nextContext: CurrentChatContext | null = context;
    if (
      prev != null &&
      context != null &&
      context.type === "stream" &&
      prev.type === "stream"
    ) {
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
      hasOlderMessages: true,
      hasNewerMessages: false,
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
      const fresh = msgs.filter((m) => !existingIds.has(m.id));
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
        for (let qi = 0; qi < state.pendingOutgoingEchoKeys.length; qi++) {
          const echoKey = state.pendingOutgoingEchoKeys[qi]!;
          const msgIdx = state.messages.findIndex((m) => {
            const key = m.local_echo_key ?? (m.id < 0 ? m.id : undefined);
            return (
              key === echoKey &&
              m.delivery_status === "sending" &&
              m.sender_id === msg.sender_id &&
              outgoingEchoContentMatches(m, msg)
            );
          });
          if (msgIdx >= 0) {
            const prev = state.messages[msgIdx]!;
            const stableKey = prev.local_echo_key ?? prev.id;
            const merged = withOutgoingDeliveryStatus({ ...msg, local_echo_key: stableKey });
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

      const idx = state.messages.findIndex((m) => m.id === msg.id);
      if (idx >= 0) {
        const updated = [...state.messages];
        updated[idx] = msg;
        idbRef.current = msg.id < 0 ? { kind: "none" } : { kind: "put", message: msg };
        return { messages: updated };
      }
      idbRef.current = msg.id < 0 ? { kind: "none" } : { kind: "put", message: msg };
      return { messages: [...state.messages, msg] };
    });

    const state = get();
    if (!state.context || !persistChatMessagesToIndexedDb()) return;
    const inst = getCurrentInstance()?.id;
    if (!inst) return;
    const idbPlan = idbRef.current;
    if (idbPlan.kind === "put") {
      void putSingleMessage({
        instanceId: inst,
        chatKey: chatKeyFromContext(state.context),
        message: idbPlan.message,
        windowSizeN: zulipMessageCacheWindowN(state.context),
      });
    } else if (idbPlan.kind === "mergeReplace") {
      if (idbPlan.removeId < 0) {
        void deleteMessagesByIds(inst, [idbPlan.removeId]);
      }
      void putSingleMessage({
        instanceId: inst,
        chatKey: chatKeyFromContext(state.context),
        message: idbPlan.message,
        windowSizeN: zulipMessageCacheWindowN(state.context),
      });
    }
  },

  commitOutgoingMessage(optimisticId, finalMessage) {
    const idbRef: {
      current: { kind: "none" } | { kind: "sync"; deleteNegativeId: number | null; message: MockMessage };
    } = { current: { kind: "none" } };

    set((state) => {
      const nextQueue = state.pendingOutgoingEchoKeys.filter((k) => k !== optimisticId);
      const delivered = withOutgoingDeliveryStatus(finalMessage);

      const optIdx = state.messages.findIndex(
        (m) => m.id === optimisticId || m.local_echo_key === optimisticId,
      );
      if (optIdx >= 0) {
        const prev = state.messages[optIdx]!;
        const echoKey = prev.local_echo_key ?? prev.id;
        const merged = { ...delivered, local_echo_key: echoKey };
        const updated = [...state.messages];
        updated[optIdx] = merged;
        idbRef.current = {
          kind: "sync",
          deleteNegativeId: prev.id < 0 ? prev.id : null,
          message: merged,
        };
        return { messages: updated, pendingOutgoingEchoKeys: nextQueue };
      }

      const realIdx = state.messages.findIndex((m) => m.id === finalMessage.id);
      if (realIdx >= 0) {
        const prev = state.messages[realIdx]!;
        const echoKey = prev.local_echo_key ?? optimisticId;
        const merged = { ...delivered, local_echo_key: echoKey };
        const updated = [...state.messages];
        updated[realIdx] = merged;
        idbRef.current = { kind: "sync", deleteNegativeId: null, message: merged };
        return { messages: updated, pendingOutgoingEchoKeys: nextQueue };
      }

      const merged = { ...delivered, local_echo_key: optimisticId };
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
        chatKey: chatKeyFromContext(state.context),
        message: idbPlan.message,
        windowSizeN: zulipMessageCacheWindowN(state.context),
      });
    }
  },

  removeMessage(messageId) {
    set((state) => {
      const removed = state.messages.find((m) => m.id === messageId);
      const echoKey = removed?.local_echo_key ?? (removed != null && removed.id < 0 ? removed.id : null);
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
      messages: state.messages.map((m) => {
        if (m.id !== messageId) return m;
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
      messages: state.messages.map((m) => {
        if (!ids.has(m.id)) return m;
        const flags = m.flags ?? [];
        const hasFlag = flags.includes(flag);
        if (op === "add" && !hasFlag) return { ...m, flags: [...flags, flag] };
        if (op === "remove" && hasFlag) return { ...m, flags: flags.filter((f) => f !== flag) };
        return m;
      }),
    }));
    const state = get();
    if (!state.context) return;
    if (persistChatMessagesToIndexedDb()) {
      const inst = getCurrentInstance()?.id;
      if (inst) void patchMessageFlagsInCache({ instanceId: inst, messageIds, flag, op });
    }
  },

  updateMessageContent(messageId, content, markdownSource) {
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId
          ? {
              ...m,
              content,
              ...(markdownSource !== undefined ? { markdown_source: markdownSource } : {}),
            }
          : m,
      ),
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

  setIsLoadingMore(loading) {
    set({ isLoadingMore: loading });
  },

  setHasOlderMessages(has) {
    set({ hasOlderMessages: has });
  },

  setHasNewerMessages(has) {
    set({ hasNewerMessages: has });
  },

  async loadInitialMessagesForContext({ context, focusedMessageId, currentUserId }) {
    logMessageFlow("store:loadInitial start", {
      context: summarizeChatContextForLog(context),
      focusedMessageId,
      hasCurrentUserId: currentUserId != null,
      persistIdb: persistChatMessagesToIndexedDb(),
    });

    const inst = getCurrentInstance()?.id;
    if (persistChatMessagesToIndexedDb() && inst != null && focusedMessageId == null) {
      const chatKey = chatKeyFromContext(context);
      const cached = await getChatMessagesAscending(inst, chatKey).catch(() => [] as MockMessage[]);
      const meta = await getChatMeta(inst, chatKey).catch(() => null);
      if (cached.length > 0) {
        set({
          messages: cached,
          pendingOutgoingEchoKeys: [],
          hasOlderMessages: meta?.reachedOldest !== true,
          hasNewerMessages: meta?.reachedNewest !== true,
        });
        logMessageFlow("store:loadInitial idb hydrate before api", {
          chatKey,
          cachedCount: cached.length,
        });
      }
    }

    const load =
      context.type === "stream"
        ? focusedMessageId != null
          ? fetchMessagesWithNarrow(
              context.streamWideView
                ? [{ operator: "stream", operand: context.streamName }]
                : [
                    { operator: "stream", operand: context.streamName },
                    { operator: "topic", operand: context.topic },
                  ],
              focusedMessageId,
              60,
              60,
            )
          : fetchMessages(
              context.streamName,
              context.streamWideView || context.topic === "general" ? undefined : context.topic,
            )
        : focusedMessageId != null
          ? fetchMessagesWithNarrow(
              [{ operator: "dm", operand: parseDmKeyToUserIds(context.dmKey, currentUserId) }],
              focusedMessageId,
              60,
              60,
            )
          : fetchDmMessages(parseDmKeyToUserIds(context.dmKey, currentUserId));

    let messages: MockMessage[];
    try {
      messages = await load;
    } catch (e) {
      logMessageFlow("store:loadInitial fetch failed", {
        context: summarizeChatContextForLog(context),
        error: String(e),
      });
      throw e;
    }
    logMessageFlow("store:loadInitial api response", {
      context: summarizeChatContextForLog(context),
      messageCount: messages.length,
    });
    mergeUsersFromMessages(messages);

    const flags = deriveFocusedPaginationFlags(messages, focusedMessageId);

    let nextContext: CurrentChatContext = context;
    if (messages.length > 0) {
      const first = messages[0]!;
      const fromKey = chatKeyFromMockMessage(first, currentUserId);
      if (context.type === "stream") {
        const topic = (first.subject ?? "").trim() || "general";
        nextContext = { ...context, topic, streamWideView: context.streamWideView };
      } else if (fromKey?.startsWith("dm:")) {
        const k = fromKey.slice(3);
        if (k !== context.dmKey) {
          nextContext = { type: "dm", dmKey: k };
        }
      }
    }
    const chatKeyForMeta =
      messages.length > 0
        ? (chatKeyFromMockMessage(messages[0]!, currentUserId) ?? chatKeyFromContext(nextContext))
        : chatKeyFromContext(nextContext);

    if (persistChatMessagesToIndexedDb() && inst) {
      await updateChatMetaPatch(inst, chatKeyForMeta, {
        reachedOldest: false,
        reachedNewest: false,
      });
    }

    set({
      context: nextContext,
      messages,
      pendingOutgoingEchoKeys: [],
      hasOlderMessages: flags.hasOlderMessages,
      hasNewerMessages: flags.hasNewerMessages,
    });

    if (persistChatMessagesToIndexedDb() && inst && messages.length > 0) {
      logMessageFlow("store:loadInitial idb upsert after api", {
        chatKey: chatKeyForMeta,
        instanceId: inst,
        count: messages.length,
        nextContext: summarizeChatContextForLog(nextContext),
      });
      await upsertChatMessages({
        instanceId: inst,
        chatKey: chatKeyForMeta,
        messages,
        windowSizeN: zulipMessageCacheWindowN(nextContext),
      });
    }

    logMessageFlow("store:loadInitial done", {
      count: messages.length,
      hasOlder: flags.hasOlderMessages,
      hasNewer: flags.hasNewerMessages,
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
      const page = await fetchMessagesWithNarrowPage(narrow, oldest.id, pageSize, 0);
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
        await updateChatMetaPatch(inst, chatKey, { reachedOldest: true });
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
        const windowN = zulipMessageCacheWindowN(ctx);
        await upsertChatMessages({
          instanceId: inst,
          chatKey,
          messages: fresh,
          windowSizeN: windowN,
        });
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

    logMessageFlow("store:loadNewer start", {
      context: summarizeChatContextForLog(ctx),
      anchorNewestId: newest.id,
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
      const page = await fetchMessagesWithNarrowPage(narrow, newest.id, 0, pageSize);
      const withoutAnchor = page.messages.filter((m) => m.id !== newest.id);
      const existingIds = new Set(get().messages.map((m) => m.id));
      const fresh = withoutAnchor.filter((m) => !existingIds.has(m.id));

      if (page.foundNewest && persistChatMessagesToIndexedDb() && inst) {
        await updateChatMetaPatch(inst, chatKey, { reachedNewest: true });
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
        const windowN = zulipMessageCacheWindowN(ctx);
        await upsertChatMessages({
          instanceId: inst,
          chatKey,
          messages: fresh,
          windowSizeN: windowN,
        });
      }
      logMessageFlow("store:loadNewer done", {
        context: summarizeChatContextForLog(ctx),
        freshCount: fresh.length,
        foundNewest: page.foundNewest,
        storeLenAfter: get().messages.length,
      });
    } catch (e) {
      logMessageFlow("store:loadNewer failed", { error: String(e) });
    } finally {
      set({ isLoadingMore: false });
    }
  },
}));
