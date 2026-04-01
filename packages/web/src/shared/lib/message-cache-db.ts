/**
 * IndexedDB cache for chat messages (per Zulip instance + conversation).
 *
 * Source of truth for UI when `env.CHAT_MESSAGES_SOURCE_INDEXEDDB` is enabled.
 * REST bootstrap and realtime events upsert rows; retention keeps the last N per chat.
 *
 * Usage:
 *   import { upsertChatMessages, getChatMessagesAscending } from "~/shared/lib/message-cache-db";
 */
import type { MockMessage, Reaction } from "~/shared/api/zulip.types";
import {
  notifyMessageCache,
  notifyMessageCacheMany,
} from "~/shared/lib/message-cache-bus";
import { instanceChatKey } from "~/shared/lib/message-cache-keys.lib";

function idbError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error("indexedDB error", { cause: reason });
}

const DB_NAME = "workspace-message-cache-v1";
const DB_VERSION = 2;

/** Default max messages retained per chat (last N by id). */
export const MESSAGE_CACHE_DEFAULT_WINDOW_SIZE = 200;

/** How many messages newer than cached max id to request on chat open (incremental IDB bootstrap). */
export const MESSAGE_CACHE_INITIAL_DELTA_NUM_AFTER = 200;

const STORE_MESSAGES = "messages";
const STORE_CHAT_META = "chatMeta";
const STORE_CHAT_LIST_SNAPSHOT = "chatListSnapshot";

export interface MessageCacheRow {
  /** `${instanceId}:${messageId}` */
  id: string;
  instanceId: string;
  /** `${instanceId}::${chatKey}` */
  instanceChatKey: string;
  chatKey: string;
  messageId: number;
  message: MockMessage;
  version: number;
}

export interface ChatMetaRow {
  instanceChatKey: string;
  newestMessageId: number | null;
  oldestMessageId: number | null;
  hasGaps: boolean;
  windowSizeN: number;
  lastEventIdApplied: number | null;
  lastSyncedAt: number | null;
  /** Narrow has no older messages on server (GET /messages found_oldest). */
  reachedOldest?: boolean;
  /** Narrow has no newer messages on server (GET /messages found_newest). */
  reachedNewest?: boolean;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function isIndexedDBAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

export function openMessageCacheDb(): Promise<IDBDatabase> {
  if (!isIndexedDBAvailable()) {
    return Promise.reject(new Error("indexedDB unavailable"));
  }
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => {
      dbPromise = null;
      reject(idbError(req.error));
    };
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const oldVersion = event.oldVersion;
      if (oldVersion < 1) {
        if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
          const store = db.createObjectStore(STORE_MESSAGES, { keyPath: "id" });
          store.createIndex("byChatOrder", ["instanceChatKey", "messageId"], { unique: true });
        }
        if (!db.objectStoreNames.contains(STORE_CHAT_META)) {
          db.createObjectStore(STORE_CHAT_META, { keyPath: "instanceChatKey" });
        }
      }
      if (oldVersion < 2 && !db.objectStoreNames.contains(STORE_CHAT_LIST_SNAPSHOT)) {
        db.createObjectStore(STORE_CHAT_LIST_SNAPSHOT, { keyPath: "instanceId" });
      }
    };
  });
  return dbPromise;
}

/** Test helper: reset singleton after deleting DB. */
export function resetMessageCacheDbSingletonForTests(): void {
  dbPromise = null;
}

function rowId(instanceId: string, messageId: number): string {
  return `${instanceId}:${messageId}`;
}

async function readAllMessagesInChat(
  db: IDBDatabase,
  instanceChatKey: string,
): Promise<MessageCacheRow[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MESSAGES, "readonly");
    const store = tx.objectStore(STORE_MESSAGES);
    const index = store.index("byChatOrder");
    const range = IDBKeyRange.bound(
      [instanceChatKey, 0],
      [instanceChatKey, Number.MAX_SAFE_INTEGER],
    );
    const req = index.openCursor(range);
    const rows: MessageCacheRow[] = [];
    req.onerror = () => reject(idbError(req.error));
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        rows.push(cursor.value as MessageCacheRow);
        cursor.continue();
      } else {
        resolve(rows);
      }
    };
  });
}

/**
 * Returns messages sorted ascending by Zulip message id.
 */
export async function getChatMessagesAscending(
  instanceId: string,
  chatKey: string,
): Promise<MockMessage[]> {
  if (!isIndexedDBAvailable()) return [];
  try {
    const db = await openMessageCacheDb();
    const iKey = instanceChatKey(instanceId, chatKey);
    const rows = await readAllMessagesInChat(db, iKey);
    rows.sort((a, b) => a.messageId - b.messageId);
    return rows.map((r) => r.message);
  } catch {
    return [];
  }
}

/** All message ids currently stored for the chat (for pagination dedup). */
export async function getExistingMessageIdsInChat(
  instanceId: string,
  chatKey: string,
): Promise<Set<number>> {
  if (!isIndexedDBAvailable()) return new Set();
  try {
    const db = await openMessageCacheDb();
    const iKey = instanceChatKey(instanceId, chatKey);
    const rows = await readAllMessagesInChat(db, iKey);
    return new Set(rows.map((r) => r.messageId));
  } catch {
    return new Set();
  }
}

export async function getChatMessageBounds(
  instanceId: string,
  chatKey: string,
): Promise<{ oldestId: number | null; newestId: number | null; count: number }> {
  if (!isIndexedDBAvailable()) {
    return { oldestId: null, newestId: null, count: 0 };
  }
  try {
    const db = await openMessageCacheDb();
    const iKey = instanceChatKey(instanceId, chatKey);
    const rows = await readAllMessagesInChat(db, iKey);
    if (rows.length === 0) {
      return { oldestId: null, newestId: null, count: 0 };
    }
    let min = rows[0]!.messageId;
    let max = rows[0]!.messageId;
    for (const r of rows) {
      if (r.messageId < min) min = r.messageId;
      if (r.messageId > max) max = r.messageId;
    }
    return { oldestId: min, newestId: max, count: rows.length };
  } catch {
    return { oldestId: null, newestId: null, count: 0 };
  }
}

export async function getChatMeta(
  instanceId: string,
  chatKey: string,
): Promise<ChatMetaRow | null> {
  if (!isIndexedDBAvailable()) return null;
  const db = await openMessageCacheDb();
  const key = instanceChatKey(instanceId, chatKey);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CHAT_META, "readonly");
    const req = tx.objectStore(STORE_CHAT_META).get(key);
    req.onerror = () => reject(idbError(req.error));
    req.onsuccess = () => resolve((req.result as ChatMetaRow | undefined) ?? null);
  });
}

async function putChatMetaRow(db: IDBDatabase, row: ChatMetaRow): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CHAT_META, "readwrite");
    tx.onerror = () => reject(idbError(tx.error));
    tx.oncomplete = () => resolve();
    tx.objectStore(STORE_CHAT_META).put(row);
  });
}

/**
 * Deletes oldest messages beyond the last `maxPerChat` by message id.
 */
export async function applyRetentionForChat(
  instanceId: string,
  chatKey: string,
  maxPerChat: number,
): Promise<void> {
  if (!isIndexedDBAvailable() || maxPerChat < 1) return;
  const db = await openMessageCacheDb();
  const iKey = instanceChatKey(instanceId, chatKey);
  const rows = await readAllMessagesInChat(db, iKey);
  if (rows.length <= maxPerChat) return;

  rows.sort((a, b) => a.messageId - b.messageId);
  const toRemove = rows.slice(0, rows.length - maxPerChat);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_MESSAGES, "readwrite");
    tx.onerror = () => reject(idbError(tx.error));
    tx.oncomplete = () => resolve();
    const store = tx.objectStore(STORE_MESSAGES);
    for (const r of toRemove) {
      store.delete(r.id);
    }
  });

  if (toRemove.length > 0) {
    await updateChatMetaPatch(instanceId, chatKey, { reachedOldest: false });
  }
}

function mergeChatMetaAfterUpsert(
  prev: ChatMetaRow | null,
  instanceChatKeyValue: string,
  messageIds: readonly number[],
  windowSizeN: number,
): ChatMetaRow {
  const now = Date.now();
  let newest: number | null = prev?.newestMessageId ?? null;
  let oldest: number | null = prev?.oldestMessageId ?? null;
  for (const id of messageIds) {
    if (newest == null || id > newest) newest = id;
    if (oldest == null || id < oldest) oldest = id;
  }
  return {
    instanceChatKey: instanceChatKeyValue,
    newestMessageId: newest,
    oldestMessageId: oldest,
    hasGaps: prev?.hasGaps ?? false,
    windowSizeN: prev?.windowSizeN ?? windowSizeN,
    lastEventIdApplied: prev?.lastEventIdApplied ?? null,
    lastSyncedAt: now,
    reachedOldest: prev?.reachedOldest ?? false,
    reachedNewest: prev?.reachedNewest ?? false,
  };
}

export interface UpsertChatMessagesResult {
  instanceChatKey: string;
}

/**
 * Upserts messages for a chat and applies retention. Notifies subscribers.
 */
export async function upsertChatMessages(options: {
  instanceId: string;
  chatKey: string;
  messages: readonly MockMessage[];
  windowSizeN: number;
}): Promise<UpsertChatMessagesResult> {
  const { instanceId, chatKey, messages, windowSizeN } = options;
  const iKey = instanceChatKey(instanceId, chatKey);
  if (!isIndexedDBAvailable() || messages.length === 0) {
    return { instanceChatKey: iKey };
  }

  const db = await openMessageCacheDb();
  const meta = await getChatMeta(instanceId, chatKey);
  const ids = messages.map((m) => m.id);

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_MESSAGES, STORE_CHAT_META], "readwrite");
    tx.onerror = () => reject(idbError(tx.error));
    tx.oncomplete = () => resolve();
    const msgStore = tx.objectStore(STORE_MESSAGES);
    let versionCounter = Date.now();
    for (const m of messages) {
      versionCounter += 1;
      const row: MessageCacheRow = {
        id: rowId(instanceId, m.id),
        instanceId,
        instanceChatKey: iKey,
        chatKey,
        messageId: m.id,
        message: m,
        version: versionCounter,
      };
      msgStore.put(row);
    }
    const nextMeta = mergeChatMetaAfterUpsert(meta, iKey, ids, windowSizeN);
    tx.objectStore(STORE_CHAT_META).put(nextMeta);
  });

  await applyRetentionForChat(instanceId, chatKey, windowSizeN);
  notifyMessageCache(iKey);
  return { instanceChatKey: iKey };
}

export async function updateChatMetaPatch(
  instanceId: string,
  chatKey: string,
  patch: Partial<
    Pick<
      ChatMetaRow,
      | "hasGaps"
      | "windowSizeN"
      | "lastEventIdApplied"
      | "newestMessageId"
      | "oldestMessageId"
      | "reachedOldest"
      | "reachedNewest"
    >
  >,
): Promise<void> {
  if (!isIndexedDBAvailable()) return;
  const db = await openMessageCacheDb();
  const iKey = instanceChatKey(instanceId, chatKey);
  const prev = await getChatMeta(instanceId, chatKey);
  const next: ChatMetaRow = {
    instanceChatKey: iKey,
    newestMessageId: patch.newestMessageId ?? prev?.newestMessageId ?? null,
    oldestMessageId: patch.oldestMessageId ?? prev?.oldestMessageId ?? null,
    hasGaps: patch.hasGaps ?? prev?.hasGaps ?? false,
    windowSizeN: patch.windowSizeN ?? prev?.windowSizeN ?? 200,
    lastEventIdApplied: patch.lastEventIdApplied ?? prev?.lastEventIdApplied ?? null,
    lastSyncedAt: Date.now(),
    reachedOldest: patch.reachedOldest ?? prev?.reachedOldest ?? false,
    reachedNewest: patch.reachedNewest ?? prev?.reachedNewest ?? false,
  };
  await putChatMetaRow(db, next);
  notifyMessageCache(iKey);
}

async function getMessageRow(
  db: IDBDatabase,
  instanceId: string,
  messageId: number,
): Promise<MessageCacheRow | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MESSAGES, "readonly");
    const req = tx.objectStore(STORE_MESSAGES).get(rowId(instanceId, messageId));
    req.onerror = () => reject(idbError(req.error));
    req.onsuccess = () => resolve(req.result as MessageCacheRow | undefined);
  });
}

export async function deleteMessagesByIds(
  instanceId: string,
  messageIds: readonly number[],
): Promise<void> {
  if (!isIndexedDBAvailable() || messageIds.length === 0) return;
  const db = await openMessageCacheDb();
  const keysToNotify = new Set<string>();
  for (const mid of messageIds) {
    const row = await getMessageRow(db, instanceId, mid);
    if (row) keysToNotify.add(row.instanceChatKey);
  }
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_MESSAGES, "readwrite");
    tx.onerror = () => reject(idbError(tx.error));
    tx.oncomplete = () => resolve();
    const store = tx.objectStore(STORE_MESSAGES);
    for (const mid of messageIds) {
      store.delete(rowId(instanceId, mid));
    }
  });
  notifyMessageCacheMany([...keysToNotify]);
}

export async function patchMessageFlagsInCache(options: {
  instanceId: string;
  messageIds: readonly number[];
  flag: string;
  op: "add" | "remove";
}): Promise<void> {
  const { instanceId, messageIds, flag, op } = options;
  if (!isIndexedDBAvailable() || messageIds.length === 0) return;
  const db = await openMessageCacheDb();
  const keysToNotify = new Set<string>();
  const toWrite: MessageCacheRow[] = [];

  for (const mid of messageIds) {
    const row = await getMessageRow(db, instanceId, mid);
    if (!row) continue;
    keysToNotify.add(row.instanceChatKey);
    const flags = row.message.flags ?? [];
    const has = flags.includes(flag);
    let nextFlags: string[];
    if (op === "add" && !has) nextFlags = [...flags, flag];
    else if (op === "remove" && has) nextFlags = flags.filter((f) => f !== flag);
    else nextFlags = flags;
    const nextMsg: MockMessage = { ...row.message, flags: nextFlags };
    toWrite.push({
      ...row,
      message: nextMsg,
      version: row.version + 1,
    });
  }

  if (toWrite.length === 0) return;

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_MESSAGES, "readwrite");
    tx.onerror = () => reject(idbError(tx.error));
    tx.oncomplete = () => resolve();
    const store = tx.objectStore(STORE_MESSAGES);
    for (const r of toWrite) {
      store.put(r);
    }
  });

  notifyMessageCacheMany([...keysToNotify]);
}

export async function patchMessageReactionInCache(options: {
  instanceId: string;
  messageId: number;
  reaction: Reaction;
  op: "add" | "remove";
}): Promise<void> {
  const { instanceId, messageId, reaction, op } = options;
  if (!isIndexedDBAvailable()) return;
  const db = await openMessageCacheDb();
  const existing = await getMessageRow(db, instanceId, messageId);
  if (!existing) return;
  const list = existing.message.reactions ?? [];
  const exists = list.some(
    (r) => r.emoji_name === reaction.emoji_name && r.user_id === reaction.user_id,
  );
  let nextReactions: Reaction[];
  if (op === "add") {
    nextReactions = exists ? list : [...list, reaction];
  } else {
    nextReactions = list.filter(
      (r) => !(r.emoji_name === reaction.emoji_name && r.user_id === reaction.user_id),
    );
  }
  const nextRow: MessageCacheRow = {
    ...existing,
    message: { ...existing.message, reactions: nextReactions },
    version: existing.version + 1,
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_MESSAGES, "readwrite");
    tx.onerror = () => reject(idbError(tx.error));
    tx.oncomplete = () => resolve();
    tx.objectStore(STORE_MESSAGES).put(nextRow);
  });
  notifyMessageCache(existing.instanceChatKey);
}

export async function patchMessageContentInCache(options: {
  instanceId: string;
  messageId: number;
  content: string;
}): Promise<void> {
  const { instanceId, messageId, content } = options;
  if (!isIndexedDBAvailable()) return;
  const db = await openMessageCacheDb();
  const existing = await getMessageRow(db, instanceId, messageId);
  if (!existing) return;
  const nextRow: MessageCacheRow = {
    ...existing,
    message: { ...existing.message, content },
    version: existing.version + 1,
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_MESSAGES, "readwrite");
    tx.onerror = () => reject(idbError(tx.error));
    tx.oncomplete = () => resolve();
    tx.objectStore(STORE_MESSAGES).put(nextRow);
  });
  notifyMessageCache(existing.instanceChatKey);
}

export async function putSingleMessage(options: {
  instanceId: string;
  chatKey: string;
  message: MockMessage;
  windowSizeN: number;
}): Promise<void> {
  await upsertChatMessages({
    instanceId: options.instanceId,
    chatKey: options.chatKey,
    messages: [options.message],
    windowSizeN: options.windowSizeN,
  });
}
