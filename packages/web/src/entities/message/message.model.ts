/**
 * Current chat messages store — holds messages for the active chat view.
 *
 * Resets on context (stream/topic or DM) change; updated by real-time events
 * for reactions, flags, content edits, and deletions.
 */
import { create } from "zustand";
import { getCurrentInstance } from "~/shared/api/client";
import type {
  MockMessage,
  MockMessageDeliveryStatus,
  Reaction,
  ZulipRawMessage,
} from "~/shared/api/zulip";
import { dmConversationKey } from "~/shared/lib/dm-key";

export type CurrentChatContext =
  | { type: "stream"; streamId: number; streamName: string; topic: string }
  | { type: "dm"; dmKey: string };

interface CurrentChatMessagesState {
  context: CurrentChatContext | null;
  messages: MockMessage[];
  isLoadingMore: boolean;
  hasOlderMessages: boolean;
  hasNewerMessages: boolean;
  setContext: (context: CurrentChatContext | null) => void;
  setMessages: (messages: MockMessage[]) => void;
  prependMessages: (msgs: MockMessage[]) => void;
  appendMessages: (msgs: MockMessage[]) => void;
  appendMessage: (msg: MockMessage) => void;
  removeMessage: (messageId: number) => void;
  removeMessages: (messageIds: number[]) => void;
  updateMessageReaction: (messageId: number, reaction: Reaction, op: "add" | "remove") => void;
  updateMessageFlags: (messageIds: number[], flag: string, op: "add" | "remove") => void;
  updateMessageContent: (messageId: number, content: string) => void;
  setIsLoadingMore: (loading: boolean) => void;
  setHasOlderMessages: (has: boolean) => void;
  setHasNewerMessages: (has: boolean) => void;
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
const MAX_MESSAGES_PER_CONTEXT = 200;
const MAX_CACHED_CONTEXTS = 25;

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
  const storage = getStorage();
  if (!storage) return [];
  const cache = loadMessageCache(storage, getMessageCacheStorageKey());
  return cache[getContextCacheKey(context)]?.messages ?? [];
}

function persistMessagesForContext(context: CurrentChatContext, messages: MockMessage[]): void {
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

export const useCurrentChatMessagesStore = create<CurrentChatMessagesState>((set, get) => ({
  context: null,
  messages: [],
  isLoadingMore: false,
  hasOlderMessages: true,
  hasNewerMessages: false,

  setContext(context) {
    const cachedMessages = context ? loadCachedMessagesForContext(context) : [];
    set({
      context,
      messages: cachedMessages,
      isLoadingMore: false,
      hasOlderMessages: true,
      hasNewerMessages: false,
    });
  },

  setMessages(messages) {
    set({ messages });
    const state = get();
    if (state.context) {
      persistMessagesForContext(state.context, state.messages);
    }
  },

  prependMessages(msgs) {
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
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== messageId),
    }));
    const state = get();
    if (state.context) {
      persistMessagesForContext(state.context, state.messages);
    }
  },

  removeMessages(messageIds) {
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
}));
