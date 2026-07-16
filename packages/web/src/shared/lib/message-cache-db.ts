/**
 * IndexedDB message cache for cold-start bootstrap and per-chat retention.
 */
import type { MessageReactions, MockMessage } from "~/shared/api/messenger.types";
import { runMessageCacheDbUpgrade } from "~/shared/lib/message-cache-db-upgrade.lib";
import { instanceChatKey } from "~/shared/lib/message-cache-keys.lib";
import { compareMessageTimeline } from "~/shared/lib/message-id.lib";
import type { MessageId } from "~/shared/lib/message-id.lib";
import { MESSENGER_DM_INITIAL_WINDOW_TOTAL } from "~/shared/lib/messenger-message-window.lib";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import { resolveTopicMoveTargetMessageIds } from "~/shared/lib/update-message-topic-move.lib";

function idbError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error("indexedDB error", { cause: reason });
}

const DB_NAME = "workspace-message-cache-v1";
const DB_VERSION = 13;

/** IndexedDB database name for message/chat bootstrap cache (tests, cold-start wipe). */
export const MESSAGE_CACHE_DB_NAME = DB_NAME;

/** Current schema version (E2E seed helpers must not open with a lower version). */
export const MESSAGE_CACHE_DB_VERSION = DB_VERSION;

const IDB_DELETE_BLOCKED_TIMEOUT_MS = 3_000;

export const MESSAGE_CACHE_DEFAULT_WINDOW_SIZE = MESSENGER_DM_INITIAL_WINDOW_TOTAL;

const STORE_MESSAGES = "messages";
const STORE_CHAT_META = "chatMeta";
/** Persisted avatar image blobs per organization instance (LRU eviction). */
export const STORE_AVATAR_BLOBS = "avatarBlobs";

export interface MessageCacheRow {
  id: string;
  instanceId: string;
  instanceChatKey: string;
  chatKey: string;
  messageId: MessageId;
  timeline: number;
  message: MockMessage;
  version: number;
}

export interface ChatMetaRow {
  instanceChatKey: string;
  newestMessageId: MessageId | null;
  oldestMessageId: MessageId | null;
  hasGaps: boolean;
  windowSizeN: number;
  lastEventIdApplied: number | null;
  lastSyncedAt: number | null;
  reachedOldest?: boolean;
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
      void event;
      runMessageCacheDbUpgrade(req.result, req.transaction);
    };
  });
  return dbPromise;
}

/** Test helper: resets singleton after database deletion. */
export function resetMessageCacheDbSingletonForTests(): void {
  dbPromise = null;
}

/** Drops the message cache database and resets the open-connection singleton (cold-start wipe). */
export async function deleteMessageCacheDatabase(): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    if (dbPromise != null) {
      const db = await dbPromise.catch(() => null);
      db?.close();
    }
  } catch {
    /* close is best-effort */
  }
  dbPromise = null;

  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    let settled = false;
    const finishOk = (): void => {
      if (settled) return;
      settled = true;
      resolve();
    };
    req.onsuccess = () => finishOk();
    req.onerror = () => {
      if (settled) return;
      settled = true;
      reject(idbError(req.error));
    };
    req.onblocked = () => {
      globalThis.setTimeout(() => finishOk(), IDB_DELETE_BLOCKED_TIMEOUT_MS);
    };
  });
}

/** Removes message bodies and per-chat metadata for one legacy instance partition. */
export async function deleteMessageCacheForInstance(instanceId: string): Promise<void> {
  if (!isIndexedDBAvailable()) return;
  try {
    const db = await openMessageCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_MESSAGES, STORE_CHAT_META], "readwrite");
      tx.onerror = () => reject(idbError(tx.error));
      tx.oncomplete = () => resolve();
      const prefix = `${instanceId}:`;
      const range = IDBKeyRange.bound(prefix, `${prefix}\uffff`);
      tx.objectStore(STORE_MESSAGES).delete(range);
      tx.objectStore(STORE_CHAT_META).delete(range);
    });
  } catch {
    // Best-effort account-cache invalidation.
  }
}

function rowId(instanceId: string, messageId: MessageId): string {
  return `${instanceId}:${messageId}`;
}

async function readAllMessagesInChat(
  db: IDBDatabase,
  instanceChatKey: string,
): Promise<MessageCacheRow[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MESSAGES, "readonly");
    const store = tx.objectStore(STORE_MESSAGES);
    const index = store.index("byChatTimeline");
    const range = IDBKeyRange.bound(
      [instanceChatKey, 0, ""],
      [instanceChatKey, Number.MAX_SAFE_INTEGER, "\uffff"],
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

export async function getChatMessagesAscending(
  instanceId: string,
  chatKey: string,
): Promise<MockMessage[]> {
  if (!isIndexedDBAvailable()) return [];
  try {
    const db = await openMessageCacheDb();
    const iKey = instanceChatKey(instanceId, chatKey);
    const rows = await readAllMessagesInChat(db, iKey);
    rows.sort((a, b) => compareMessageTimeline(a.message, b.message));
    return rows.map((r) => r.message);
  } catch {
    return [];
  }
}

/** Best-effort bootstrap for pages outside the current chat. */
export async function getInstanceMessagesAscending(instanceId: string): Promise<MockMessage[]> {
  if (!isIndexedDBAvailable()) return [];

  try {
    const db = await openMessageCacheDb();

    return await new Promise<MockMessage[]>((resolve, reject) => {
      const tx = db.transaction(STORE_MESSAGES, "readonly");
      const store = tx.objectStore(STORE_MESSAGES);

      /**
       * Primary keys are `${instanceId}:${messageId}` — range-scan by instance prefix
       * avoids a full store scan. UUID keys are not timeline order, so sort by timestamp.
       */
      const range = IDBKeyRange.bound(`${instanceId}:`, `${instanceId}:\uffff`);

      const req = store.openCursor(range);
      const messages: MockMessage[] = [];

      req.onerror = () => reject(idbError(req.error));

      req.onsuccess = () => {
        const cursor = req.result;

        if (!cursor) {
          messages.sort(compareMessageTimeline);
          resolve(messages);
          return;
        }

        const row = cursor.value as MessageCacheRow;
        messages.push(row.message);

        cursor.continue();
      };
    });
  } catch {
    return [];
  }
}

/** Cache-first bootstrap for stream-wide mode (`/stream/:slug`). */
export async function getStreamMessagesAscending(
  instanceId: string,
  streamId: string,
): Promise<MockMessage[]> {
  if (!isIndexedDBAvailable()) return [];
  try {
    const db = await openMessageCacheDb();
    const indexPrefix = instanceChatKey(instanceId, `stream:${streamId}:`);
    return await new Promise<MockMessage[]>((resolve, reject) => {
      const tx = db.transaction(STORE_MESSAGES, "readonly");
      const store = tx.objectStore(STORE_MESSAGES);
      const index = store.index("byChatTimeline");
      const range = IDBKeyRange.bound(
        [indexPrefix, 0, ""],
        [`${indexPrefix}\uffff`, Number.MAX_SAFE_INTEGER, "\uffff"],
      );
      const req = index.openCursor(range);
      const rows: MessageCacheRow[] = [];

      req.onerror = () => reject(idbError(req.error));
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          rows.push(cursor.value as MessageCacheRow);
          cursor.continue();
          return;
        }
        rows.sort((a, b) => compareMessageTimeline(a.message, b.message));
        resolve(rows.map((row) => row.message));
      };
    });
  } catch {
    return [];
  }
}

export async function getExistingMessageIdsInChat(
  instanceId: string,
  chatKey: string,
): Promise<Set<MessageId>> {
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
): Promise<{ oldestId: MessageId | null; newestId: MessageId | null; count: number }> {
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
    rows.sort((a, b) => compareMessageTimeline(a.message, b.message));
    return {
      oldestId: rows[0]!.messageId,
      newestId: rows[rows.length - 1]!.messageId,
      count: rows.length,
    };
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

  rows.sort((a, b) => compareMessageTimeline(a.message, b.message));
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
  messages: readonly MockMessage[],
  windowSizeN: number,
): ChatMetaRow {
  const now = Date.now();
  const sorted = [...messages].sort(compareMessageTimeline);
  const oldest = sorted[0]?.id ?? prev?.oldestMessageId ?? null;
  const newest = sorted[sorted.length - 1]?.id ?? prev?.newestMessageId ?? null;
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
        timeline: m.timestamp,
        message: m,
        version: versionCounter,
      };
      msgStore.put(row);
    }
    const nextMeta = mergeChatMetaAfterUpsert(meta, iKey, messages, windowSizeN);
    tx.objectStore(STORE_CHAT_META).put(nextMeta);
  });

  await applyRetentionForChat(instanceId, chatKey, windowSizeN);
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
    windowSizeN: patch.windowSizeN ?? prev?.windowSizeN ?? MESSAGE_CACHE_DEFAULT_WINDOW_SIZE,
    lastEventIdApplied: patch.lastEventIdApplied ?? prev?.lastEventIdApplied ?? null,
    lastSyncedAt: Date.now(),
    reachedOldest: patch.reachedOldest ?? prev?.reachedOldest ?? false,
    reachedNewest: patch.reachedNewest ?? prev?.reachedNewest ?? false,
  };
  await putChatMetaRow(db, next);
}

async function getMessageRow(
  db: IDBDatabase,
  instanceId: string,
  messageId: MessageId,
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
  messageIds: readonly MessageId[],
): Promise<void> {
  if (!isIndexedDBAvailable() || messageIds.length === 0) return;
  const db = await openMessageCacheDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_MESSAGES, "readwrite");
    tx.onerror = () => reject(idbError(tx.error));
    tx.oncomplete = () => resolve();
    const store = tx.objectStore(STORE_MESSAGES);
    for (const mid of messageIds) {
      store.delete(rowId(instanceId, mid));
    }
  });
}

export async function patchMessageFlagsInCache(options: {
  instanceId: string;
  messageIds: readonly MessageId[];
  flag: string;
  op: "add" | "remove";
}): Promise<void> {
  const { instanceId, messageIds, flag, op } = options;
  if (!isIndexedDBAvailable() || messageIds.length === 0) return;
  const db = await openMessageCacheDb();
  const toWrite: MessageCacheRow[] = [];

  for (const mid of messageIds) {
    const row = await getMessageRow(db, instanceId, mid);
    if (!row) continue;
    const flags = row.message.flags ?? [];
    const has = flags.includes(flag);
    let nextFlags: string[];
    if (op === "add" && !has) nextFlags = [...flags, flag];
    else if (op === "remove" && has) nextFlags = flags.filter((f) => f !== flag);
    else nextFlags = flags;
    const booleanPatch = messageFlagBooleanPatch(row.message, flag, op === "add");
    if (nextFlags === flags && booleanPatch == null) {
      continue;
    }
    const nextMsg: MockMessage = {
      ...row.message,
      flags: nextFlags,
      ...booleanPatch,
    };
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
}

function messageFlagBooleanPatch(
  message: MockMessage,
  flag: string,
  value: boolean,
): Partial<MockMessage> | null {
  if (flag === "read") return message.read === value ? null : { read: value };
  if (flag === "starred") return message.starred === value ? null : { starred: value };
  if (flag === "pinned") return message.pinned === value ? null : { pinned: value };
  return null;
}

export async function replaceMessageReactionsInCache(options: {
  instanceId: string;
  messageId: MessageId;
  reactions: MessageReactions;
}): Promise<void> {
  const { instanceId, messageId, reactions } = options;
  if (!isIndexedDBAvailable()) return;
  const db = await openMessageCacheDb();
  const existing = await getMessageRow(db, instanceId, messageId);
  if (!existing) return;
  const nextRow: MessageCacheRow = {
    ...existing,
    message: { ...existing.message, reactions },
    version: existing.version + 1,
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_MESSAGES, "readwrite");
    tx.onerror = () => reject(idbError(tx.error));
    tx.oncomplete = () => resolve();
    tx.objectStore(STORE_MESSAGES).put(nextRow);
  });
}

export async function patchMessageContentInCache(options: {
  instanceId: string;
  messageId: MessageId;
  content: string;
  /** When set, updates `markdown_source`; when omitted, keeps the previous value. */
  markdown_source?: string;
}): Promise<void> {
  const { instanceId, messageId, content, markdown_source: markdownSource } = options;
  if (!isIndexedDBAvailable()) return;
  const db = await openMessageCacheDb();
  const existing = await getMessageRow(db, instanceId, messageId);
  if (!existing) return;
  const nextRow: MessageCacheRow = {
    ...existing,
    message: {
      ...existing.message,
      content,
      ...(markdownSource !== undefined ? { markdown_source: markdownSource } : {}),
    },
    version: existing.version + 1,
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_MESSAGES, "readwrite");
    tx.onerror = () => reject(idbError(tx.error));
    tx.oncomplete = () => resolve();
    tx.objectStore(STORE_MESSAGES).put(nextRow);
  });
}

interface ChatMetaSeed {
  hasGaps: boolean;
  windowSizeN: number;
  lastEventIdApplied: number | null;
  reachedOldest: boolean;
  reachedNewest: boolean;
}

function deriveChatMetaSeed(previous: ChatMetaRow | null | undefined): ChatMetaSeed {
  return {
    hasGaps: previous?.hasGaps ?? false,
    windowSizeN: previous?.windowSizeN ?? MESSAGE_CACHE_DEFAULT_WINDOW_SIZE,
    lastEventIdApplied: previous?.lastEventIdApplied ?? null,
    reachedOldest: previous?.reachedOldest ?? false,
    reachedNewest: previous?.reachedNewest ?? false,
  };
}

function mergeChatMetaSeeds(left: ChatMetaSeed, right: ChatMetaSeed): ChatMetaSeed {
  return {
    hasGaps: left.hasGaps || right.hasGaps,
    windowSizeN: left.windowSizeN ?? right.windowSizeN ?? MESSAGE_CACHE_DEFAULT_WINDOW_SIZE,
    lastEventIdApplied: left.lastEventIdApplied ?? right.lastEventIdApplied ?? null,
    reachedOldest: left.reachedOldest || right.reachedOldest,
    reachedNewest: left.reachedNewest || right.reachedNewest,
  };
}

function buildChatMetaRowFromRows(options: {
  instanceChatKeyValue: string;
  rows: readonly MessageCacheRow[];
  seed: ChatMetaSeed;
}): ChatMetaRow | null {
  const { rows, seed, instanceChatKeyValue } = options;
  if (rows.length === 0) return null;
  const sortedRows = [...rows].sort((a, b) => compareMessageTimeline(a.message, b.message));
  const oldest = sortedRows[0]!.messageId;
  const newest = sortedRows[sortedRows.length - 1]!.messageId;
  return {
    instanceChatKey: instanceChatKeyValue,
    oldestMessageId: oldest,
    newestMessageId: newest,
    hasGaps: seed.hasGaps,
    windowSizeN: seed.windowSizeN,
    lastEventIdApplied: seed.lastEventIdApplied,
    lastSyncedAt: Date.now(),
    reachedOldest: seed.reachedOldest,
    reachedNewest: seed.reachedNewest,
  };
}

export async function moveTopicMessagesInCache(options: {
  instanceId: string;
  streamId: string;
  oldTopic: string;
  newTopic: string;
  messageIds?: readonly MessageId[];
  anchorMessageId?: MessageId;
}): Promise<void> {
  const { instanceId, streamId, oldTopic, newTopic, messageIds, anchorMessageId } = options;
  if (!isIndexedDBAvailable()) return;
  if (streamId.trim().length === 0) return;
  const oldTopicKey = normalizeTopicForIdentity(oldTopic);
  const newTopicKey = normalizeTopicForIdentity(newTopic);
  if (oldTopicKey === newTopicKey) return;

  const oldChatKey = `stream:${streamId}:${oldTopicKey}`;
  const newChatKey = `stream:${streamId}:${newTopicKey}`;
  const oldInstanceChatKey = instanceChatKey(instanceId, oldChatKey);
  const newInstanceChatKey = instanceChatKey(instanceId, newChatKey);

  const normalizedTopicFromMessage = (message: MockMessage): string =>
    normalizeTopicForIdentity(message.topic_uuid ?? message.subject ?? "");

  const targetMessageIds = new Set(
    resolveTopicMoveTargetMessageIds({
      messageIds,
      anchorMessageId,
    }),
  );
  if (targetMessageIds.size === 0) return;

  const db = await openMessageCacheDb();
  const oldMetaBefore = await getChatMeta(instanceId, oldChatKey).catch(() => null);
  const newMetaBefore = await getChatMeta(instanceId, newChatKey).catch(() => null);
  const rowsInOldPartition = await readAllMessagesInChat(db, oldInstanceChatKey);

  const byIdCandidates = new Map<MessageId, MessageCacheRow>();
  for (const messageId of targetMessageIds) {
    const row = await getMessageRow(db, instanceId, messageId);
    if (!row) continue;
    if (row.message.stream_uuid !== streamId) continue;
    if (normalizedTopicFromMessage(row.message) !== oldTopicKey) continue;
    byIdCandidates.set(messageId, row);
  }

  const effectiveRowsToMoveMap = new Map<MessageId, MessageCacheRow>();
  for (const row of rowsInOldPartition) {
    if (!targetMessageIds.has(row.messageId)) continue;
    effectiveRowsToMoveMap.set(row.messageId, row);
  }
  for (const row of byIdCandidates.values()) {
    effectiveRowsToMoveMap.set(row.messageId, row);
  }
  const effectiveRowsToMove = Array.from(effectiveRowsToMoveMap.values());
  if (effectiveRowsToMove.length === 0) return;

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_MESSAGES, "readwrite");
    tx.onerror = () => reject(idbError(tx.error));
    tx.oncomplete = () => resolve();
    const store = tx.objectStore(STORE_MESSAGES);
    for (const row of effectiveRowsToMove) {
      const nextMessage = { ...row.message, subject: newTopicKey };
      store.put({
        ...row,
        chatKey: newChatKey,
        instanceChatKey: newInstanceChatKey,
        message: nextMessage,
        version: row.version + 1,
      } satisfies MessageCacheRow);
    }
  });

  const rowsInOldAfter = await readAllMessagesInChat(db, oldInstanceChatKey);
  const rowsInNewAfter = await readAllMessagesInChat(db, newInstanceChatKey);
  const oldMetaSeed = deriveChatMetaSeed(oldMetaBefore);
  const newMetaSeed = mergeChatMetaSeeds(
    deriveChatMetaSeed(newMetaBefore),
    deriveChatMetaSeed(oldMetaBefore),
  );
  const oldMetaAfter = buildChatMetaRowFromRows({
    instanceChatKeyValue: oldInstanceChatKey,
    rows: rowsInOldAfter,
    seed: oldMetaSeed,
  });
  const newMetaAfter = buildChatMetaRowFromRows({
    instanceChatKeyValue: newInstanceChatKey,
    rows: rowsInNewAfter,
    seed: newMetaSeed,
  });

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_CHAT_META, "readwrite");
    tx.onerror = () => reject(idbError(tx.error));
    tx.oncomplete = () => resolve();
    const store = tx.objectStore(STORE_CHAT_META);
    if (oldMetaAfter == null) {
      store.delete(oldInstanceChatKey);
    } else {
      store.put(oldMetaAfter);
    }
    if (newMetaAfter == null) {
      store.delete(newInstanceChatKey);
    } else {
      store.put(newMetaAfter);
    }
  });
}

export async function moveTopicToStreamInCache(options: {
  instanceId: string;
  sourceStreamId: string;
  targetStreamId: string;
  oldTopic: string;
  newTopic: string;
  messageIds?: readonly MessageId[];
  anchorMessageId?: MessageId;
}): Promise<void> {
  const {
    instanceId,
    sourceStreamId,
    targetStreamId,
    oldTopic,
    newTopic,
    messageIds,
    anchorMessageId,
  } = options;
  if (!isIndexedDBAvailable()) return;
  if (sourceStreamId.trim().length === 0) return;
  if (targetStreamId.trim().length === 0) return;
  if (sourceStreamId === targetStreamId) return;
  const oldTopicKey = normalizeTopicForIdentity(oldTopic);
  const newTopicKey = normalizeTopicForIdentity(newTopic);

  const oldChatKey = `stream:${sourceStreamId}:${oldTopicKey}`;
  const newChatKey = `stream:${targetStreamId}:${newTopicKey}`;
  const oldInstanceChatKey = instanceChatKey(instanceId, oldChatKey);
  const newInstanceChatKey = instanceChatKey(instanceId, newChatKey);

  const normalizedTopicFromMessage = (message: MockMessage): string =>
    normalizeTopicForIdentity(message.topic_uuid ?? message.subject ?? "");

  const targetMessageIds = new Set(
    resolveTopicMoveTargetMessageIds({
      messageIds,
      anchorMessageId,
    }),
  );
  if (targetMessageIds.size === 0) return;

  const db = await openMessageCacheDb();
  const oldMetaBefore = await getChatMeta(instanceId, oldChatKey).catch(() => null);
  const newMetaBefore = await getChatMeta(instanceId, newChatKey).catch(() => null);
  const rowsInOldPartition = await readAllMessagesInChat(db, oldInstanceChatKey);

  const byIdCandidates = new Map<MessageId, MessageCacheRow>();
  for (const messageId of targetMessageIds) {
    const row = await getMessageRow(db, instanceId, messageId);
    if (!row) continue;
    if (row.message.stream_uuid !== sourceStreamId) continue;
    if (normalizedTopicFromMessage(row.message) !== oldTopicKey) continue;
    byIdCandidates.set(messageId, row);
  }

  const effectiveRowsToMoveMap = new Map<MessageId, MessageCacheRow>();
  for (const row of rowsInOldPartition) {
    if (!targetMessageIds.has(row.messageId)) continue;
    effectiveRowsToMoveMap.set(row.messageId, row);
  }
  for (const row of byIdCandidates.values()) {
    effectiveRowsToMoveMap.set(row.messageId, row);
  }
  const effectiveRowsToMove = Array.from(effectiveRowsToMoveMap.values());
  if (effectiveRowsToMove.length === 0) return;

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_MESSAGES, "readwrite");
    tx.onerror = () => reject(idbError(tx.error));
    tx.oncomplete = () => resolve();
    const store = tx.objectStore(STORE_MESSAGES);
    for (const row of effectiveRowsToMove) {
      const nextMessage = {
        ...row.message,
        stream_uuid: targetStreamId,
        subject: newTopicKey,
      };
      store.put({
        ...row,
        chatKey: newChatKey,
        instanceChatKey: newInstanceChatKey,
        message: nextMessage,
        version: row.version + 1,
      } satisfies MessageCacheRow);
    }
  });

  const rowsInOldAfter = await readAllMessagesInChat(db, oldInstanceChatKey);
  const rowsInNewAfter = await readAllMessagesInChat(db, newInstanceChatKey);
  const oldMetaSeed = deriveChatMetaSeed(oldMetaBefore);
  const newMetaSeed = mergeChatMetaSeeds(
    deriveChatMetaSeed(newMetaBefore),
    deriveChatMetaSeed(oldMetaBefore),
  );
  const oldMetaAfter = buildChatMetaRowFromRows({
    instanceChatKeyValue: oldInstanceChatKey,
    rows: rowsInOldAfter,
    seed: oldMetaSeed,
  });
  const newMetaAfter = buildChatMetaRowFromRows({
    instanceChatKeyValue: newInstanceChatKey,
    rows: rowsInNewAfter,
    seed: newMetaSeed,
  });

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_CHAT_META, "readwrite");
    tx.onerror = () => reject(idbError(tx.error));
    tx.oncomplete = () => resolve();
    const store = tx.objectStore(STORE_CHAT_META);
    if (oldMetaAfter == null) {
      store.delete(oldInstanceChatKey);
    } else {
      store.put(oldMetaAfter);
    }
    if (newMetaAfter == null) {
      store.delete(newInstanceChatKey);
    } else {
      store.put(newMetaAfter);
    }
  });
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
