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
  computeHasMoreNewerAfterIdbDeltaFetch,
  filterDeltaMessagesNotInCache,
  mergeCachedMessagesWithDelta,
} from "~/shared/lib/message-bootstrap-merge.lib";
import {
  deleteMessagesByIds,
  getChatMessageBounds,
  getChatMessagesAscending,
  getChatMeta,
  getExistingMessageIdsInChat,
  MESSAGE_CACHE_DEFAULT_WINDOW_SIZE,
  MESSAGE_CACHE_INITIAL_DELTA_NUM_AFTER,
  MESSAGE_CACHE_MIN_CACHED_MESSAGES_FOR_INCREMENTAL_INITIAL,
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
  computeHasNewerAfterLoadNewerMemoryPage,
  computeHasOlderAfterLoadOlderIdbPage,
  computeHasOlderAfterLoadOlderMemoryPage,
  mergeOlderLoadAnchor,
} from "~/shared/lib/message-pagination-boundary.lib";
import { chatKeyFromContext, chatKeyFromMockMessage } from "~/shared/lib/message-cache-keys.lib";
import { isSameChatLocation, parseDmKeyToUserIds } from "./message-chat-context.lib";
import {
  isIndexedDbMessageSource,
  loadCachedMessagesForContext,
  MAX_MESSAGES_PER_LOCAL_CACHE,
  persistMessagesForContext,
} from "./message-local-cache.lib";
import { deriveFocusedPaginationFlags } from "./message-pagination-helpers.lib";
import type { CurrentChatContext, CurrentChatMessagesState } from "./message.model.types";

export type { CurrentChatContext } from "./message.model.types";
export { contextFromMessage, isMessageForContext } from "./message-chat-context.lib";

const MAX_MESSAGES_PER_CONTEXT = MAX_MESSAGES_PER_LOCAL_CACHE;

function mergeUsersFromMessages(messages: readonly MockMessage[]): void {
  const store = useUsersStore.getState();
  for (const msg of messages) {
    store.mergeUser({
      user_id: msg.sender_id,
      full_name: msg.sender_full_name ?? "",
    });
  }
}

const idbPaginationLog = createLogger("messages:idb-pagination");
const loadOlderLog = createLogger("messages:loadOlder");

export const useCurrentChatMessagesStore = create<CurrentChatMessagesState>((set, get) => ({
  context: null,
  messages: [],
  isLoadingMore: false,
  hasOlderMessages: true,
  hasNewerMessages: false,

  setContext(context) {
    const prev = get().context;
    const keepMessages =
      isIndexedDbMessageSource() &&
      context != null &&
      prev != null &&
      isSameChatLocation(prev, context);

    const cachedMessages =
      isIndexedDbMessageSource() || !context ? [] : loadCachedMessagesForContext(context);

    let nextContext: CurrentChatContext | null = context;
    if (
      keepMessages &&
      prev != null &&
      context != null &&
      context.type === "stream" &&
      prev.type === "stream"
    ) {
      nextContext = {
        ...prev,
        streamName: context.streamName,
        streamId: context.streamId,
      };
    }

    logMessageFlow("store:setContext", {
      prev: summarizeChatContextForLog(prev),
      next: summarizeChatContextForLog(nextContext),
      keepMessages,
      idbSource: isIndexedDbMessageSource(),
      nextStoreMessagesLen: keepMessages ? get().messages.length : cachedMessages.length,
    });

    set({
      context: nextContext,
      messages: keepMessages ? get().messages : cachedMessages,
      isLoadingMore: false,
      hasOlderMessages: true,
      hasNewerMessages: false,
    });
  },

  setContextFromNavigation(context) {
    get().setContext(context);
  },

  setMessages(messages) {
    if (isIndexedDbMessageSource()) {
      logMessageFlow("store:setMessages(idb)", {
        incomingLen: messages.length,
        context: summarizeChatContextForLog(get().context),
      });
      const ctx = get().context;
      const inst = getCurrentInstance()?.id;
      if (ctx && inst && messages.length > 0) {
        void upsertChatMessages({
          instanceId: inst,
          chatKey: chatKeyFromContext(ctx),
          messages,
          windowSizeN: MAX_MESSAGES_PER_CONTEXT,
        });
      }
      set({ messages: [] });
      return;
    }
    set({ messages });
    const state = get();
    if (state.context) {
      persistMessagesForContext(state.context, state.messages);
    }
  },

  prependMessages(msgs) {
    if (isIndexedDbMessageSource()) {
      const ctx = get().context;
      const inst = getCurrentInstance()?.id;
      if (ctx && inst && msgs.length > 0) {
        void upsertChatMessages({
          instanceId: inst,
          chatKey: chatKeyFromContext(ctx),
          messages: msgs,
          windowSizeN: MAX_MESSAGES_PER_CONTEXT,
        });
      }
      return;
    }
    set((state) => {
      const existingIds = new Set(state.messages.map((m) => m.id));
      const fresh = msgs.filter((m) => !existingIds.has(m.id));
      if (fresh.length === 0) return state;
      return { messages: [...fresh, ...state.messages] };
    });
    const state = get();
    if (state.context) {
      persistMessagesForContext(state.context, state.messages);
    }
  },

  appendMessages(msgs) {
    if (isIndexedDbMessageSource()) {
      const ctx = get().context;
      const inst = getCurrentInstance()?.id;
      if (ctx && inst && msgs.length > 0) {
        void upsertChatMessages({
          instanceId: inst,
          chatKey: chatKeyFromContext(ctx),
          messages: msgs,
          windowSizeN: MAX_MESSAGES_PER_CONTEXT,
        });
      }
      return;
    }
    set((state) => {
      const existingIds = new Set(state.messages.map((m) => m.id));
      const fresh = msgs.filter((m) => !existingIds.has(m.id));
      if (fresh.length === 0) return state;
      return { messages: [...state.messages, ...fresh] };
    });
    const state = get();
    if (state.context) {
      persistMessagesForContext(state.context, state.messages);
    }
  },

  appendMessage(msg) {
    if (isIndexedDbMessageSource()) {
      const ctx = get().context;
      const inst = getCurrentInstance()?.id;
      if (ctx && inst) {
        void putSingleMessage({
          instanceId: inst,
          chatKey: chatKeyFromContext(ctx),
          message: msg,
          windowSizeN: MAX_MESSAGES_PER_CONTEXT,
        });
      }
      return;
    }
    set((state) => {
      const idx = state.messages.findIndex((m) => m.id === msg.id);
      if (idx >= 0) {
        const updated = [...state.messages];
        updated[idx] = msg;
        return { messages: updated };
      }
      return { messages: [...state.messages, msg] };
    });
    const state = get();
    if (state.context) {
      persistMessagesForContext(state.context, state.messages);
    }
  },

  removeMessage(messageId) {
    if (isIndexedDbMessageSource()) {
      const inst = getCurrentInstance()?.id;
      if (inst) void deleteMessagesByIds(inst, [messageId]);
      return;
    }
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== messageId),
    }));
    const state = get();
    if (state.context) {
      persistMessagesForContext(state.context, state.messages);
    }
  },

  removeMessages(messageIds) {
    if (isIndexedDbMessageSource()) {
      const inst = getCurrentInstance()?.id;
      if (inst) void deleteMessagesByIds(inst, messageIds);
      return;
    }
    const ids = new Set(messageIds);
    set((state) => ({
      messages: state.messages.filter((m) => !ids.has(m.id)),
    }));
    const state = get();
    if (state.context) {
      persistMessagesForContext(state.context, state.messages);
    }
  },

  updateMessageReaction(messageId, reaction, op) {
    if (isIndexedDbMessageSource()) {
      const inst = getCurrentInstance()?.id;
      if (inst) void patchMessageReactionInCache({ instanceId: inst, messageId, reaction, op });
      return;
    }
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
    if (state.context) {
      persistMessagesForContext(state.context, state.messages);
    }
  },

  updateMessageFlags(messageIds, flag, op) {
    if (isIndexedDbMessageSource()) {
      const inst = getCurrentInstance()?.id;
      if (inst) void patchMessageFlagsInCache({ instanceId: inst, messageIds, flag, op });
      return;
    }
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
    if (state.context) {
      persistMessagesForContext(state.context, state.messages);
    }
  },

  updateMessageContent(messageId, content) {
    if (isIndexedDbMessageSource()) {
      const inst = getCurrentInstance()?.id;
      if (inst) void patchMessageContentInCache({ instanceId: inst, messageId, content });
      return;
    }
    set((state) => ({
      messages: state.messages.map((m) => (m.id === messageId ? { ...m, content } : m)),
    }));
    const state = get();
    if (state.context) {
      persistMessagesForContext(state.context, state.messages);
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
      idbSource: isIndexedDbMessageSource(),
    });

    const inst = getCurrentInstance()?.id;
    /** Assigned by incremental branch or full fetch below before use. */
    let messages!: MockMessage[];
    let idbIncremental: {
      toUpsert: MockMessage[];
      foundNewest: boolean;
      withoutAnchorCount: number;
    } | null = null;

    const tryIdbIncremental =
      isIndexedDbMessageSource() && inst != null && focusedMessageId == null;

    if (tryIdbIncremental) {
      const chatKey = chatKeyFromContext(context);
      const cached = await getChatMessagesAscending(inst, chatKey).catch(() => [] as MockMessage[]);
      const cacheLargeEnoughForIncremental =
        cached.length >= MESSAGE_CACHE_MIN_CACHED_MESSAGES_FOR_INCREMENTAL_INITIAL;
      if (cached.length > 0 && !cacheLargeEnoughForIncremental) {
        logMessageFlow("store:loadInitial idb incremental skipped", {
          reason: "sparse-cache",
          chatKey,
          cachedCount: cached.length,
          minRequired: MESSAGE_CACHE_MIN_CACHED_MESSAGES_FOR_INCREMENTAL_INITIAL,
        });
      }
      if (cacheLargeEnoughForIncremental) {
        const newestCachedId = cached[cached.length - 1]!.id;
        const narrow =
          context.type === "stream"
            ? [
                { operator: "stream", operand: context.streamName },
                { operator: "topic", operand: context.topic },
              ]
            : [{ operator: "dm", operand: parseDmKeyToUserIds(context.dmKey, currentUserId) }];
        try {
          const page = await fetchMessagesWithNarrowPage(
            narrow,
            newestCachedId,
            0,
            MESSAGE_CACHE_INITIAL_DELTA_NUM_AFTER,
          );
          const withoutAnchor = page.messages.filter((m) => m.id !== newestCachedId);
          const cachedIds = new Set(cached.map((m) => m.id));
          const toUpsert = filterDeltaMessagesNotInCache(cachedIds, withoutAnchor);
          messages = mergeCachedMessagesWithDelta(cached, withoutAnchor);
          mergeUsersFromMessages(messages);
          idbIncremental = {
            toUpsert,
            foundNewest: page.foundNewest,
            withoutAnchorCount: withoutAnchor.length,
          };
          logMessageFlow("store:loadInitial idb incremental", {
            chatKey,
            cachedCount: cached.length,
            deltaCount: withoutAnchor.length,
            toUpsertCount: toUpsert.length,
            foundNewest: page.foundNewest,
          });
        } catch (e) {
          logMessageFlow("store:loadInitial incremental failed, full fetch", {
            error: String(e),
            chatKey,
          });
        }
      }
    }

    if (idbIncremental == null) {
      const load =
        context.type === "stream"
          ? focusedMessageId != null
            ? fetchMessagesWithNarrow(
                [
                  { operator: "stream", operand: context.streamName },
                  { operator: "topic", operand: context.topic },
                ],
                focusedMessageId,
                60,
                60,
              )
            : fetchMessages(
                context.streamName,
                context.topic === "general" ? undefined : context.topic,
              )
          : focusedMessageId != null
            ? fetchMessagesWithNarrow(
                [{ operator: "dm", operand: parseDmKeyToUserIds(context.dmKey, currentUserId) }],
                focusedMessageId,
                60,
                60,
              )
            : fetchDmMessages(parseDmKeyToUserIds(context.dmKey, currentUserId));

      try {
        messages = await load;
      } catch (e) {
        logMessageFlow("store:loadInitial fetch failed", {
          context: summarizeChatContextForLog(context),
          error: String(e),
        });
        throw e;
      }
      mergeUsersFromMessages(messages);
    }

    const flags = deriveFocusedPaginationFlags(messages, focusedMessageId);

    if (isIndexedDbMessageSource()) {
      const instIdb = getCurrentInstance()?.id;
      let nextContext: CurrentChatContext = context;
      if (messages.length > 0) {
        const first = messages[0]!;
        const fromKey = chatKeyFromMockMessage(first, currentUserId);
        if (context.type === "stream") {
          const topic = (first.subject ?? "").trim() || "general";
          nextContext = { ...context, topic };
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
      if (instIdb) {
        await updateChatMetaPatch(instIdb, chatKeyForMeta, {
          reachedOldest: false,
          reachedNewest: false,
        });
      }

      let hasOlderMessages = flags.hasOlderMessages;
      let hasNewerMessages = flags.hasNewerMessages;
      if (idbIncremental != null && instIdb) {
        const meta = await getChatMeta(instIdb, chatKeyForMeta);
        hasOlderMessages = !meta?.reachedOldest;
        hasNewerMessages = computeHasMoreNewerAfterIdbDeltaFetch({
          foundNewest: idbIncremental.foundNewest,
          deltaReturnedCount: idbIncremental.withoutAnchorCount,
          numAfterRequested: MESSAGE_CACHE_INITIAL_DELTA_NUM_AFTER,
        });
      }

      set({
        context: nextContext,
        messages,
        hasOlderMessages,
        hasNewerMessages,
      });
      if (instIdb && messages.length > 0) {
        if (idbIncremental != null) {
          if (idbIncremental.toUpsert.length > 0) {
            logMessageFlow("store:loadInitial idb upsert incremental", {
              chatKey: chatKeyForMeta,
              instanceId: instIdb,
              count: idbIncremental.toUpsert.length,
              nextContext: summarizeChatContextForLog(nextContext),
            });
            await upsertChatMessages({
              instanceId: instIdb,
              chatKey: chatKeyForMeta,
              messages: idbIncremental.toUpsert,
              windowSizeN: MAX_MESSAGES_PER_CONTEXT,
            });
          }
        } else {
          logMessageFlow("store:loadInitial idb upsert", {
            chatKey: chatKeyForMeta,
            instanceId: instIdb,
            count: messages.length,
            nextContext: summarizeChatContextForLog(nextContext),
          });
          await upsertChatMessages({
            instanceId: instIdb,
            chatKey: chatKeyForMeta,
            messages,
            windowSizeN: MAX_MESSAGES_PER_CONTEXT,
          });
        }
      }
      logMessageFlow("store:loadInitial done(idb)", {
        storeMessagesLen: messages.length,
        hasOlder: hasOlderMessages,
        hasNewer: hasNewerMessages,
        incremental: idbIncremental != null,
      });
      return;
    }

    logMessageFlow("store:loadInitial done(memory)", {
      count: messages.length,
      hasOlder: flags.hasOlderMessages,
      hasNewer: flags.hasNewerMessages,
    });
    set({
      messages,
      hasOlderMessages: flags.hasOlderMessages,
      hasNewerMessages: flags.hasNewerMessages,
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

    if (isIndexedDbMessageSource()) {
      const inst = getCurrentInstance()?.id;
      if (!inst) {
        logMessageFlow("store:loadOlder idb abort no instance", {});
        return;
      }
      const chatKey = chatKeyFromContext(ctx);
      const meta = await getChatMeta(inst, chatKey);
      if (meta?.reachedOldest) {
        logMessageFlow("store:loadOlder idb meta reachedOldest", { chatKey });
        set({ hasOlderMessages: false });
        return;
      }
      const bounds = await getChatMessageBounds(inst, chatKey);
      const storeOldestId = get().messages[0]?.id ?? null;
      const anchorOldest = mergeOlderLoadAnchor(storeOldestId, bounds.oldestId);
      if (anchorOldest == null) {
        loadOlderLog.debug("loadOlder idb abort: no oldest id in store or idb", { chatKey });
        return;
      }

      set({ isLoadingMore: true });
      try {
        const narrow =
          ctx.type === "stream"
            ? [
                { operator: "stream", operand: ctx.streamName },
                { operator: "topic", operand: ctx.topic },
              ]
            : [{ operator: "dm", operand: parseDmKeyToUserIds(ctx.dmKey, currentUserId) }];
        const existingIds = await getExistingMessageIdsInChat(inst, chatKey);
        const storeBeforeMerge = get().messages.length;
        loadOlderLog.debug("loadOlder idb fetch", {
          chatKey,
          storeOldestId,
          idbOldestId: bounds.oldestId,
          anchorOldest,
          pageSize,
          storeMessagesBefore: storeBeforeMerge,
        });
        const page = await fetchMessagesWithNarrowPage(narrow, anchorOldest, pageSize, 0);
        const withoutAnchor = page.messages.filter((m) => m.id !== anchorOldest);
        const toUpsert = withoutAnchor.filter((m) => !existingIds.has(m.id));
        const pageIds = page.messages.map((m) => m.id);
        const pageIdMin = pageIds.length > 0 ? Math.min(...pageIds) : undefined;
        const pageIdMax = pageIds.length > 0 ? Math.max(...pageIds) : undefined;
        const waIds = withoutAnchor.map((m) => m.id);
        const withoutAnchorIdMin = waIds.length > 0 ? Math.min(...waIds) : undefined;
        const withoutAnchorIdMax = waIds.length > 0 ? Math.max(...waIds) : undefined;
        logMessageFlow("store:loadOlder idb api page", {
          chatKey,
          context: summarizeChatContextForLog(ctx),
          storeOldestId,
          idbOldestId: bounds.oldestId,
          anchorOldest,
          idbCachedRowCount: bounds.count,
          existingIdsInIdbCount: existingIds.size,
          apiMessageCount: page.messages.length,
          pageIdMin,
          pageIdMax,
          withoutAnchorCount: withoutAnchor.length,
          withoutAnchorIdMin,
          withoutAnchorIdMax,
          toUpsertCount: toUpsert.length,
          foundOldest: page.foundOldest,
        });
        if (withoutAnchor.length === 0) {
          const idsReturned = page.messages.map((m) => m.id);
          logMessageFlow("store:loadOlder idb api no rows before anchor", {
            chatKey,
            anchorOldest,
            foundOldest: page.foundOldest,
            rawApiRowCount: page.messages.length,
            messageIdsReturned: idsReturned.slice(0, 20),
            onlyAnchorInResponse:
              page.messages.length === 1 && page.messages[0]?.id === anchorOldest,
            narrowType: ctx.type,
          });
        }

        if (page.foundOldest) {
          await updateChatMetaPatch(inst, chatKey, { reachedOldest: true });
        }

        if (toUpsert.length > 0) {
          const storeLenBeforePrepend = get().messages.length;
          mergeUsersFromMessages(toUpsert);
          await upsertChatMessages({
            instanceId: inst,
            chatKey,
            messages: toUpsert,
            windowSizeN: MAX_MESSAGES_PER_CONTEXT,
          });
          set((s) => {
            const existingIds = new Set(s.messages.map((m) => m.id));
            const fresh = toUpsert.filter((m) => !existingIds.has(m.id));
            if (fresh.length === 0) return s;
            return { messages: [...fresh, ...s.messages] };
          });
          const after = get().messages;
          logMessageFlow("store:loadOlder idb zustand after merge", {
            chatKey,
            storeLen: after.length,
            storeLenBeforePrepend,
            deltaLen: after.length - storeLenBeforePrepend,
            storeFirstId: after[0]?.id,
            storeLastId: after[after.length - 1]?.id,
          });
          loadOlderLog.info("loadOlder idb merged", {
            chatKey,
            anchorOldest,
            apiRows: page.messages.length,
            withoutAnchor: withoutAnchor.length,
            toUpsert: toUpsert.length,
            storeMessagesAfter: get().messages.length,
            foundOldest: page.foundOldest,
          });
        } else {
          loadOlderLog.info("loadOlder idb no new rows to upsert", {
            chatKey,
            anchorOldest,
            apiRows: page.messages.length,
            withoutAnchor: withoutAnchor.length,
            foundOldest: page.foundOldest,
          });
        }

        if (toUpsert.length === 0 && withoutAnchor.length > 0) {
          idbPaginationLog.warn("loadOlder: only duplicate ids vs IndexedDB", {
            chatKey,
            anchorOldest,
          });
        }
        const nextHasOlder = computeHasOlderAfterLoadOlderIdbPage({
          foundOldest: page.foundOldest,
          withoutAnchorCount: withoutAnchor.length,
          pageSize,
          toUpsertCount: toUpsert.length,
        });
        logMessageFlow("store:loadOlder idb pagination flag", {
          chatKey,
          hasOlderMessages: nextHasOlder,
          foundOldest: page.foundOldest,
          withoutAnchorCount: withoutAnchor.length,
          pageSize,
          toUpsertCount: toUpsert.length,
        });
        set({
          hasOlderMessages: nextHasOlder,
        });
      } catch (e) {
        loadOlderLog.warn("loadOlder idb failed", { chatKey, error: String(e) });
        // best-effort; keep boundary flags unchanged
      } finally {
        set({ isLoadingMore: false });
      }
      return;
    }

    if (state.messages.length === 0) {
      loadOlderLog.debug("loadOlder memory abort: empty store");
      return;
    }
    const oldest = state.messages[0];
    if (!oldest) return;

    set({ isLoadingMore: true });
    try {
      const narrow =
        ctx.type === "stream"
          ? [
              { operator: "stream", operand: ctx.streamName },
              { operator: "topic", operand: ctx.topic },
            ]
          : [{ operator: "dm", operand: parseDmKeyToUserIds(ctx.dmKey, currentUserId) }];
      const page = await fetchMessagesWithNarrowPage(narrow, oldest.id, pageSize, 0);
      const withoutAnchor = page.messages.filter((m) => m.id !== oldest.id);
      loadOlderLog.debug("loadOlder memory page", {
        anchorOldest: oldest.id,
        apiRows: page.messages.length,
        withoutAnchor: withoutAnchor.length,
      });
      set({
        hasOlderMessages: computeHasOlderAfterLoadOlderMemoryPage({
          foundOldest: page.foundOldest,
          withoutAnchorCount: withoutAnchor.length,
          pageSize,
        }),
      });
      if (withoutAnchor.length > 0) {
        mergeUsersFromMessages(withoutAnchor);
        set((s) => ({ messages: [...withoutAnchor, ...s.messages] }));
        loadOlderLog.info("loadOlder memory prepended", {
          anchorOldest: oldest.id,
          prepended: withoutAnchor.length,
          storeMessagesAfter: get().messages.length,
        });
      }
    } catch (e) {
      loadOlderLog.warn("loadOlder memory failed", { error: String(e) });
      // best-effort; keep boundary flags unchanged
    } finally {
      set({ isLoadingMore: false });
    }
  },

  async loadNewerBoundaryPage({ pageSize, currentUserId }) {
    const state = get();
    const ctx = state.context;
    if (state.isLoadingMore || !state.hasNewerMessages || !ctx) return;

    if (isIndexedDbMessageSource()) {
      const inst = getCurrentInstance()?.id;
      if (!inst) return;
      const chatKey = chatKeyFromContext(ctx);
      const meta = await getChatMeta(inst, chatKey);
      if (meta?.reachedNewest) {
        set({ hasNewerMessages: false });
        return;
      }
      const bounds = await getChatMessageBounds(inst, chatKey);
      if (bounds.newestId == null) return;

      set({ isLoadingMore: true });
      try {
        const narrow =
          ctx.type === "stream"
            ? [
                { operator: "stream", operand: ctx.streamName },
                { operator: "topic", operand: ctx.topic },
              ]
            : [{ operator: "dm", operand: parseDmKeyToUserIds(ctx.dmKey, currentUserId) }];
        const existingIds = await getExistingMessageIdsInChat(inst, chatKey);
        const page = await fetchMessagesWithNarrowPage(narrow, bounds.newestId, 0, pageSize);
        const withoutAnchor = page.messages.filter((m) => m.id !== bounds.newestId);
        const toUpsert = withoutAnchor.filter((m) => !existingIds.has(m.id));

        if (page.foundNewest) {
          await updateChatMetaPatch(inst, chatKey, { reachedNewest: true });
        }

        if (toUpsert.length > 0) {
          mergeUsersFromMessages(toUpsert);
          await upsertChatMessages({
            instanceId: inst,
            chatKey,
            messages: toUpsert,
            windowSizeN: MAX_MESSAGES_PER_CONTEXT,
          });
        }

        if (toUpsert.length === 0 && withoutAnchor.length > 0) {
          idbPaginationLog.warn("loadNewer: only duplicate ids vs IndexedDB", {
            chatKey,
            anchorNewest: bounds.newestId,
          });
        }
        set({
          hasNewerMessages: computeHasNewerAfterLoadNewerIdbPage({
            foundNewest: page.foundNewest,
            withoutAnchorCount: withoutAnchor.length,
            pageSize,
            toUpsertCount: toUpsert.length,
          }),
        });
      } catch {
        // best-effort; keep boundary flags unchanged
      } finally {
        set({ isLoadingMore: false });
      }
      return;
    }

    if (state.messages.length === 0) return;
    const newest = state.messages[state.messages.length - 1];
    if (!newest) return;

    set({ isLoadingMore: true });
    try {
      const narrow =
        ctx.type === "stream"
          ? [
              { operator: "stream", operand: ctx.streamName },
              { operator: "topic", operand: ctx.topic },
            ]
          : [{ operator: "dm", operand: parseDmKeyToUserIds(ctx.dmKey, currentUserId) }];
      const page = await fetchMessagesWithNarrowPage(narrow, newest.id, 0, pageSize);
      const withoutAnchor = page.messages.filter((m) => m.id !== newest.id);
      set({
        hasNewerMessages: computeHasNewerAfterLoadNewerMemoryPage({
          foundNewest: page.foundNewest,
          withoutAnchorCount: withoutAnchor.length,
          pageSize,
        }),
      });
      if (withoutAnchor.length > 0) {
        mergeUsersFromMessages(withoutAnchor);
        set((s) => ({ messages: [...s.messages, ...withoutAnchor] }));
      }
    } catch {
      // best-effort; keep boundary flags unchanged
    } finally {
      set({ isLoadingMore: false });
    }
  },
}));
