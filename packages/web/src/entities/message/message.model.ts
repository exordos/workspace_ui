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
} from "~/shared/api/zulip";
import type {
  MockMessage,
  MockMessageDeliveryStatus,
  Reaction,
  ZulipRawMessage,
} from "~/shared/api/zulip.types";
import { dmConversationKey } from "~/shared/lib/dm-key";
import { env } from "~/shared/lib/env";
import {
  deleteMessagesByIds,
  getChatMessageBounds,
  MESSAGE_CACHE_DEFAULT_WINDOW_SIZE,
  patchMessageContentInCache,
  patchMessageFlagsInCache,
  patchMessageReactionInCache,
  putSingleMessage,
  upsertChatMessages,
} from "~/shared/lib/message-cache-db";
import {
  logMessageFlow,
  summarizeChatContextForLog,
} from "~/shared/lib/message-flow-debug.lib";
import {
  chatKeyFromContext,
  chatKeyFromMockMessage,
  normalizeStreamTopicForMessageCache,
} from "~/shared/lib/message-cache-keys.lib";
import type { CurrentChatContext, CurrentChatMessagesState } from "./message.model.types";

export type { CurrentChatContext } from "./message.model.types";

/** True when route points to the same stream/topic or DM as the current store context (re-sync without navigation). */
function isSameChatLocation(prev: CurrentChatContext | null, next: CurrentChatContext | null): boolean {
  if (prev == null || next == null) return false;
  if (prev.type !== next.type) return false;
  if (prev.type === "stream" && next.type === "stream") {
    if (prev.streamId !== next.streamId) return false;
    const pt = normalizeStreamTopicForMessageCache(prev.topic);
    const nt = normalizeStreamTopicForMessageCache(next.topic);
    if (pt === nt) return true;
    return pt.toLowerCase() === nt.toLowerCase();
  }
  if (prev.type === "dm" && next.type === "dm") {
    return prev.dmKey === next.dmKey;
  }
  return false;
}

export function isMessageForContext(
  msg: {
    type?: string;
    stream_id?: number | null;
    subject?: string;
    display_recipient?: string | { id: number }[];
  },
  context: CurrentChatContext | null,
  currentUserId: number | null,
): boolean {
  if (!context) return false;
  if (context.type === "stream") {
    return (
      msg.type === "stream" &&
      msg.stream_id === context.streamId &&
      ((msg.subject ?? "").trim() || "general") === context.topic
    );
  }
  if (context.type === "dm") {
    if (msg.type !== "private" || !Array.isArray(msg.display_recipient)) return false;
    const key = dmConversationKey(msg.display_recipient, currentUserId);
    return key === context.dmKey;
  }
  return false;
}

export function contextFromMessage(
  msg: ZulipRawMessage,
  currentUserId: number | null,
): CurrentChatContext | null {
  if (msg.type === "stream" && msg.stream_id != null) {
    const name =
      typeof msg.display_recipient === "string" ? msg.display_recipient : String(msg.stream_id);
    const topic = (msg.subject ?? "").trim() || "general";
    return { type: "stream", streamId: msg.stream_id, streamName: name, topic };
  }
  if (msg.type === "private" && Array.isArray(msg.display_recipient)) {
    const dmKey = dmConversationKey(msg.display_recipient, currentUserId);
    return { type: "dm", dmKey };
  }
  return null;
}

const CURRENT_CHAT_CACHE_KEY = "workspace-offline-current-chat-messages-v1";
const MAX_MESSAGES_PER_CONTEXT = MESSAGE_CACHE_DEFAULT_WINDOW_SIZE;
const MAX_CACHED_CONTEXTS = 25;

function isIndexedDbMessageSource(): boolean {
  return env.CHAT_MESSAGES_SOURCE_INDEXEDDB;
}

interface MessageCacheEntry {
  updatedAt: number;
  messages: MockMessage[];
}

type MessageCache = Record<string, MessageCacheEntry>;

interface StoredMessageCandidate {
  id: number;
  sender_id: number;
  sender_full_name: string;
  stream_id: number | null;
  subject: string;
  content: string;
  timestamp: number;
  display_recipient?: MockMessage["display_recipient"];
  channel?: string;
  flags?: string[];
  reactions?: Reaction[];
  delivery_status?: MockMessageDeliveryStatus;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isReaction(value: unknown): value is Reaction {
  return (
    isRecord(value) &&
    typeof value.emoji_name === "string" &&
    typeof value.emoji_code === "string" &&
    typeof value.reaction_type === "string" &&
    typeof value.user_id === "number"
  );
}

function isReactionArray(value: unknown): value is Reaction[] {
  return Array.isArray(value) && value.every(isReaction);
}

function isMockMessageDeliveryStatus(value: unknown): value is MockMessageDeliveryStatus {
  return value === "sending" || value === "failed" || value === "sent";
}

function isDisplayRecipient(value: unknown): value is MockMessage["display_recipient"] {
  if (typeof value === "string") return true;
  if (!Array.isArray(value)) return false;
  return value.every((recipient) => {
    if (!isRecord(recipient)) return false;
    if (typeof recipient.id !== "number") return false;
    if (typeof recipient.full_name !== "string") return false;
    if (recipient.email != null && typeof recipient.email !== "string") return false;
    if (recipient.avatar_url != null && typeof recipient.avatar_url !== "string") return false;
    return true;
  });
}

function isStoredMessageCandidate(value: unknown): value is StoredMessageCandidate {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "number") return false;
  if (typeof value.sender_id !== "number") return false;
  if (typeof value.sender_full_name !== "string") return false;
  if (!(typeof value.stream_id === "number" || value.stream_id === null)) return false;
  if (typeof value.subject !== "string") return false;
  if (typeof value.content !== "string") return false;
  if (typeof value.timestamp !== "number") return false;
  if (value.display_recipient != null && !isDisplayRecipient(value.display_recipient)) return false;
  if (value.channel != null && typeof value.channel !== "string") return false;
  if (value.flags != null && !isStringArray(value.flags)) return false;
  if (value.reactions != null && !isReactionArray(value.reactions)) return false;
  if (value.delivery_status != null && !isMockMessageDeliveryStatus(value.delivery_status))
    return false;
  return true;
}

function normalizeStoredMessages(value: unknown): MockMessage[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isStoredMessageCandidate).map((message) => ({
    id: message.id,
    sender_id: message.sender_id,
    sender_full_name: message.sender_full_name,
    stream_id: message.stream_id,
    subject: message.subject,
    content: message.content,
    timestamp: message.timestamp,
    display_recipient: message.display_recipient,
    channel: message.channel,
    flags: message.flags,
    reactions: message.reactions,
    delivery_status: message.delivery_status,
  }));
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function getMessageCacheStorageKey(): string {
  const instanceId = getCurrentInstance()?.id ?? "global";
  return `${CURRENT_CHAT_CACHE_KEY}:${instanceId}`;
}

function getContextCacheKey(context: CurrentChatContext): string {
  if (context.type === "stream") {
    return `stream:${context.streamId}:${context.topic}`;
  }
  return `dm:${context.dmKey}`;
}

function loadMessageCache(storage: Storage, storageKey: string): MessageCache {
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return {};

    const cache: MessageCache = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!isRecord(value)) continue;
      const messages = normalizeStoredMessages(value.messages);
      if (messages.length === 0) continue;
      const updatedAt = typeof value.updatedAt === "number" ? value.updatedAt : 0;
      cache[key] = { updatedAt, messages };
    }
    return cache;
  } catch {
    return {};
  }
}

function saveMessageCache(storage: Storage, storageKey: string, cache: MessageCache): void {
  try {
    storage.setItem(storageKey, JSON.stringify(cache));
  } catch {
    // best-effort cache write (quota/restricted storage)
  }
}

function loadCachedMessagesForContext(context: CurrentChatContext): MockMessage[] {
  if (isIndexedDbMessageSource()) return [];
  const storage = getStorage();
  if (!storage) return [];
  const cache = loadMessageCache(storage, getMessageCacheStorageKey());
  return cache[getContextCacheKey(context)]?.messages ?? [];
}

function persistMessagesForContext(context: CurrentChatContext, messages: MockMessage[]): void {
  if (isIndexedDbMessageSource()) return;
  const storage = getStorage();
  if (!storage) return;

  const storageKey = getMessageCacheStorageKey();
  const contextKey = getContextCacheKey(context);
  const cache = loadMessageCache(storage, storageKey);
  const trimmedMessages = messages.slice(-MAX_MESSAGES_PER_CONTEXT);

  if (trimmedMessages.length === 0) {
    delete cache[contextKey];
    saveMessageCache(storage, storageKey, cache);
    return;
  }

  const nextCache: MessageCache = {
    ...cache,
    [contextKey]: {
      updatedAt: Date.now(),
      messages: trimmedMessages,
    },
  };

  const sortedEntries = Object.entries(nextCache)
    .sort(([, left], [, right]) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_CACHED_CONTEXTS);
  const prunedCache: MessageCache = {};
  for (const [key, entry] of sortedEntries) {
    prunedCache[key] = entry;
  }

  saveMessageCache(storage, storageKey, prunedCache);
}

function deriveFocusedPaginationFlags(
  messages: readonly { id: number }[],
  focusedMessageId: number | null,
): { hasOlderMessages: boolean; hasNewerMessages: boolean } {
  if (focusedMessageId == null) {
    return { hasOlderMessages: true, hasNewerMessages: false };
  }

  let hasOlderMessages = false;
  let hasNewerMessages = false;
  for (const message of messages) {
    if (message.id < focusedMessageId) hasOlderMessages = true;
    else if (message.id > focusedMessageId) hasNewerMessages = true;
    if (hasOlderMessages && hasNewerMessages) break;
  }
  return { hasOlderMessages, hasNewerMessages };
}

function parseDmKeyToUserIds(dmKey: string, currentUserId: number | null): number[] {
  const parts = dmKey
    .split(",")
    .map((p) => Number(p))
    .filter((n) => Number.isSafeInteger(n) && n > 0);
  const uniqueValidIds = Array.from(new Set(parts));
  if (currentUserId == null) return uniqueValidIds;
  const withoutCurrentUser = uniqueValidIds.filter((id) => id !== currentUserId);
  return withoutCurrentUser.length > 0 ? withoutCurrentUser : uniqueValidIds;
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
    mergeUsersFromMessages(messages);
    const flags = deriveFocusedPaginationFlags(messages, focusedMessageId);

    if (isIndexedDbMessageSource()) {
      const inst = getCurrentInstance()?.id;
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
      // Mirror API result in store first so the list renders immediately; IDB upsert + hook may lag behind notify ordering.
      set({
        context: nextContext,
        messages,
        hasOlderMessages: flags.hasOlderMessages,
        hasNewerMessages: flags.hasNewerMessages,
      });
      if (inst && messages.length > 0) {
        const first = messages[0]!;
        const chatKey =
          chatKeyFromMockMessage(first, currentUserId) ?? chatKeyFromContext(nextContext);
        logMessageFlow("store:loadInitial idb upsert", {
          chatKey,
          instanceId: inst,
          count: messages.length,
          nextContext: summarizeChatContextForLog(nextContext),
        });
        await upsertChatMessages({
          instanceId: inst,
          chatKey,
          messages,
          windowSizeN: MAX_MESSAGES_PER_CONTEXT,
        });
      }
      logMessageFlow("store:loadInitial done(idb)", {
        storeMessagesLen: messages.length,
        hasOlder: flags.hasOlderMessages,
        hasNewer: flags.hasNewerMessages,
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
    if (state.isLoadingMore || !state.hasOlderMessages || !ctx) return;

    if (isIndexedDbMessageSource()) {
      const inst = getCurrentInstance()?.id;
      if (!inst) return;
      const chatKey = chatKeyFromContext(ctx);
      const bounds = await getChatMessageBounds(inst, chatKey);
      if (bounds.oldestId == null) return;

      set({ isLoadingMore: true });
      try {
        const narrow =
          ctx.type === "stream"
            ? [
                { operator: "stream", operand: ctx.streamName },
                { operator: "topic", operand: ctx.topic },
              ]
            : [{ operator: "dm", operand: parseDmKeyToUserIds(ctx.dmKey, currentUserId) }];
        const older = await fetchMessagesWithNarrow(narrow, bounds.oldestId, pageSize, 0);
        const withoutAnchor = older.filter((m) => m.id !== bounds.oldestId);
        if (withoutAnchor.length < pageSize) {
          set({ hasOlderMessages: false });
        }
        if (withoutAnchor.length > 0) {
          mergeUsersFromMessages(withoutAnchor);
          await upsertChatMessages({
            instanceId: inst,
            chatKey,
            messages: withoutAnchor,
            windowSizeN: MAX_MESSAGES_PER_CONTEXT,
          });
        }
      } catch {
        // best-effort; keep boundary flags unchanged
      } finally {
        set({ isLoadingMore: false });
      }
      return;
    }

    if (state.messages.length === 0) return;
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
      const older = await fetchMessagesWithNarrow(narrow, oldest.id, pageSize, 0);
      const withoutAnchor = older.filter((m) => m.id !== oldest.id);
      if (withoutAnchor.length < pageSize) {
        set({ hasOlderMessages: false });
      }
      if (withoutAnchor.length > 0) {
        mergeUsersFromMessages(withoutAnchor);
        set((s) => ({ messages: [...withoutAnchor, ...s.messages] }));
      }
    } catch {
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
        const newer = await fetchMessagesWithNarrow(narrow, bounds.newestId, 0, pageSize);
        const withoutAnchor = newer.filter((m) => m.id !== bounds.newestId);
        if (withoutAnchor.length < pageSize) {
          set({ hasNewerMessages: false });
        }
        if (withoutAnchor.length > 0) {
          mergeUsersFromMessages(withoutAnchor);
          await upsertChatMessages({
            instanceId: inst,
            chatKey,
            messages: withoutAnchor,
            windowSizeN: MAX_MESSAGES_PER_CONTEXT,
          });
        }
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
      const newer = await fetchMessagesWithNarrow(narrow, newest.id, 0, pageSize);
      const withoutAnchor = newer.filter((m) => m.id !== newest.id);
      if (withoutAnchor.length < pageSize) {
        set({ hasNewerMessages: false });
      }
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
