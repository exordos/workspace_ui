/**
 * localStorage-backed cache for current-chat messages when IndexedDB source is disabled.
 */
import { getCurrentInstance } from "~/shared/api/client";
import type {
  MockMessage,
  MockMessageDeliveryStatus,
  Reaction,
} from "~/shared/api/zulip.types";
import { env } from "~/shared/lib/env";
import { MESSAGE_CACHE_DEFAULT_WINDOW_SIZE } from "~/shared/lib/message-cache-db";
import type { CurrentChatContext } from "./message.model.types";

const CURRENT_CHAT_CACHE_KEY = "workspace-offline-current-chat-messages-v1";

export const MAX_MESSAGES_PER_LOCAL_CACHE = MESSAGE_CACHE_DEFAULT_WINDOW_SIZE;
const MAX_CACHED_CONTEXTS = 25;

export function isIndexedDbMessageSource(): boolean {
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

export function loadCachedMessagesForContext(context: CurrentChatContext): MockMessage[] {
  if (isIndexedDbMessageSource()) return [];
  const storage = getStorage();
  if (!storage) return [];
  const cache = loadMessageCache(storage, getMessageCacheStorageKey());
  return cache[getContextCacheKey(context)]?.messages ?? [];
}

export function persistMessagesForContext(context: CurrentChatContext, messages: MockMessage[]): void {
  if (isIndexedDbMessageSource()) return;
  const storage = getStorage();
  if (!storage) return;

  const storageKey = getMessageCacheStorageKey();
  const contextKey = getContextCacheKey(context);
  const cache = loadMessageCache(storage, storageKey);
  const trimmedMessages = messages.slice(-MAX_MESSAGES_PER_LOCAL_CACHE);

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
