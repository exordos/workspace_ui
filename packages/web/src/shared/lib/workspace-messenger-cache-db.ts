import { createLogger } from "./logger";
import {
  runWorkspaceMessengerCacheDbUpgrade,
  WORKSPACE_MESSENGER_CACHE_STORES,
} from "./workspace-messenger-cache-db-upgrade.lib";

const DB_NAME = "workspace-messenger-cache-v1";
// Version 7 stores a monotonic read boundary for each owner topic.
const DB_VERSION = 7;
const IDB_DELETE_BLOCKED_TIMEOUT_MS = 3_000;
const DEFAULT_MESSAGE_BUCKET_RETENTION = 500;
const ORDER_KEY_SEPARATOR = "|";
const log = createLogger("workspace-messenger-cache");

function logCacheWriteFailure(operation: string, error: unknown): void {
  log.warn("Could not persist messenger cache state", {
    operation,
    error: error instanceof Error ? error.name : "unknown",
  });
}

export const WORKSPACE_MESSENGER_CACHE_DB_NAME = DB_NAME;
export const WORKSPACE_MESSENGER_CACHE_DB_VERSION = DB_VERSION;

export type WorkspaceMessengerConversationKind = "stream" | "topic";

export interface WorkspaceMessengerCacheOwnerMetaRow {
  ownerKey: string;
  schemaVersion: number;
  lastHydratedAt: number | null;
  lastCompactedAt: number | null;
}

export interface WorkspaceMessengerCachedStream {
  uuid: string;
  color?: number | null;
  lastMessageUuid?: string | null;
  updatedAt?: string | null;
}

export interface WorkspaceMessengerStreamCacheRow {
  id: string;
  ownerKey: string;
  streamUuid: string;
  stream: WorkspaceMessengerCachedStream;
  lastMessageCreatedAt?: string | null;
  updatedAt: string;
  cacheUpdatedAt: number;
}

export interface WorkspaceMessengerCachedTopic {
  uuid: string;
  streamUuid: string;
  lastMessageUuid?: string | null;
  summary?: string | null;
  summaryLastMessageUuid?: string | null;
  summaryHasNewMessages?: boolean | null;
  summaryEnabled?: boolean;
  summarySystemPrompt?: string | null;
  summaryReasoningEffort?: "minimal" | "low" | "medium" | "high" | null;
  updatedAt?: string | null;
}

export interface WorkspaceMessengerTopicCacheRow {
  id: string;
  ownerKey: string;
  topicUuid: string;
  streamUuid: string;
  topic: WorkspaceMessengerCachedTopic;
  lastMessageCreatedAt?: string | null;
  updatedAt: string;
  cacheUpdatedAt: number;
}

export interface WorkspaceMessengerCachedConversation {
  id: string;
  streamUuid: string;
  topicUuid?: string;
  title?: string;
  unreadCount?: number;
  lastMessageUuid?: string | null;
  updatedAt?: string | null;
}

export interface WorkspaceMessengerConversationCacheRow {
  id: string;
  ownerKey: string;
  conversationId: string;
  kind: WorkspaceMessengerConversationKind;
  streamUuid: string;
  topicUuid?: string;
  title: string;
  unreadCount: number;
  lastMessageUuid: string | null;
  conversation: WorkspaceMessengerCachedConversation;
  lastMessageCreatedAt?: string | null;
  updatedAt: string;
  cacheUpdatedAt: number;
}

export interface WorkspaceMessengerCachedFolder {
  uuid: string;
  items?: WorkspaceMessengerCachedFolderItem[];
  updatedAt?: string | null;
}

export interface WorkspaceMessengerFolderCacheRow {
  id: string;
  ownerKey: string;
  folderUuid: string;
  folder: WorkspaceMessengerCachedFolder;
  updatedAt: string;
  cacheUpdatedAt: number;
}

export interface WorkspaceMessengerCachedFolderItem {
  uuid: string;
  folderUuid: string;
  conversationId: string;
  streamUuid: string;
  chatType: string;
  orderIndex?: number | null;
  pinnedAt?: string | null;
  updatedAt?: string | null;
}

export interface WorkspaceMessengerFolderItemCacheRow {
  id: string;
  ownerKey: string;
  folderItemUuid: string;
  folderUuid: string;
  conversationId: string;
  streamUuid: string;
  chatType: string;
  orderIndex: number | null;
  pinnedAt: string | null;
  folderItem: WorkspaceMessengerCachedFolderItem;
  updatedAt: string;
  cacheUpdatedAt: number;
}

export interface WorkspaceMessengerCachedUser {
  uuid: string;
  updatedAt?: string | null;
}

export interface WorkspaceMessengerUserCacheRow {
  id: string;
  ownerKey: string;
  userUuid: string;
  user: WorkspaceMessengerCachedUser;
  updatedAt: string;
  cacheUpdatedAt: number;
}

export interface WorkspaceMessengerCachedStreamBinding {
  uuid: string;
  streamUuid: string;
  updatedAt?: string | null;
}

export interface WorkspaceMessengerStreamBindingCacheRow {
  id: string;
  ownerKey: string;
  streamBindingUuid: string;
  streamUuid: string;
  streamBinding: WorkspaceMessengerCachedStreamBinding;
  updatedAt: string;
  cacheUpdatedAt: number;
}

export interface WorkspaceMessengerCachedMessage {
  uuid: string;
  conversationId: string;
  streamUuid: string;
  topicUuid: string;
  payload: WorkspaceMessengerCachedMessagePayload;
  read?: boolean;
  createdAt: string;
  updatedAt?: string | null;
}

export interface WorkspaceMessengerCachedMessagePayload {
  kind: "markdown";
  content: string;
}

export interface WorkspaceMessengerMessageCacheRow {
  id: string;
  ownerKey: string;
  messageUuid: string;
  message: WorkspaceMessengerCachedMessage;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface WorkspaceMessengerMessageBucketRow {
  id: string;
  ownerKey: string;
  conversationId: string;
  messageUuid: string;
  createdAt: string;
  orderKey: string;
}

export interface WorkspaceMessengerMessageWindowRow {
  id: string;
  ownerKey: string;
  conversationId: string;
  oldestMessageUuid: string | null;
  newestMessageUuid: string | null;
  nextPageMarker: string | null;
  hasMore: boolean;
  reachedOldest: boolean;
  reachedNewest: boolean;
  hasGaps: boolean;
  windowSize: number;
  lastSyncedAt: number | null;
}

// В этой таблице хранится только связь текущего пользователя с его reaction_uuid.
// Списки всех реакторов сюда намеренно не попадают: они быстро устаревают,
// раздувают cache и не нужны для удаления своей реакции.
export interface WorkspaceMessengerOwnMessageReactionCacheRow {
  id: string;
  ownerKey: string;
  messageUuid: string;
  userUuid: string;
  reactionUuid: string;
  emojiName: string;
  createdAt: string;
  updatedAt: string;
  cacheUpdatedAt: number;
}

// Записывающие helper-ы принимают строку без служебных cache-полей. ownerKey
// передается отдельным аргументом, чтобы вызывающий код не мог смешать данные
// разных runtime owner-ов при гонках вкладок или переключении аккаунта.
export interface WorkspaceMessengerOwnMessageReactionCacheWrite {
  messageUuid: string;
  userUuid: string;
  reactionUuid: string;
  emojiName: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMessengerRealtimeCursorRow {
  ownerKey: string;
  epochVersion: number;
  updatedAt: number;
}

export interface WorkspaceMessengerReadBoundaryCacheRow {
  id: string;
  ownerKey: string;
  streamUuid: string;
  topicUuid: string;
  createdAt: string;
  messageUuid: string;
  epochVersion?: number;
}

export interface WorkspaceMessengerSearchResultRow {
  id: string;
  ownerKey: string;
  queryHash: string;
  query: string;
  filters: unknown;
  resultMessageUuids: string[];
  createdAt: number;
  expiresAt: number;
}

export interface WorkspaceMessengerComposerDraftCacheRow<TContent = unknown> {
  id: string;
  ownerKey: string;
  conversationId: string;
  snapshotId: string;
  content: TContent;
  updatedAt: number;
}

export interface WorkspaceMessengerComposerDraftRecordCacheRow<TContent = unknown> {
  id: string;
  ownerKey: string;
  draftUuid: string;
  conversationId: string;
  streamUuid: string;
  topicUuid: string;
  snapshotId: string;
  content: TContent;
  etag: string | null;
  disposition: "editable" | "consumed";
  syncStatus: "local" | "saving" | "saved" | "failed" | "conflict" | "deleting";
  updatedAt: number;
  serverUpdatedAt: string | null;
  conflictServerContent?: TContent;
  conflictServerEtag?: string;
  pendingCreatePayload?: string | null;
}

export interface WorkspaceMessengerComposerDraftRecordCacheWrite<TContent> {
  draftUuid: string;
  conversationId: string;
  streamUuid: string;
  topicUuid: string;
  snapshotId: string;
  content: TContent;
  etag: string | null;
  disposition: WorkspaceMessengerComposerDraftRecordCacheRow["disposition"];
  syncStatus: WorkspaceMessengerComposerDraftRecordCacheRow["syncStatus"];
  updatedAt: number;
  serverUpdatedAt: string | null;
  conflictServerContent?: TContent;
  conflictServerEtag?: string;
  pendingCreatePayload?: string | null;
}

function normalizeComposerDraftDisposition(
  disposition: unknown,
  syncStatus: WorkspaceMessengerComposerDraftRecordCacheRow["syncStatus"],
): WorkspaceMessengerComposerDraftRecordCacheRow["disposition"] {
  if (disposition === "editable" || disposition === "consumed") return disposition;
  return syncStatus === "deleting" ? "consumed" : "editable";
}

export interface WorkspaceMessengerCatalogCacheSnapshot {
  ownerMeta: WorkspaceMessengerCacheOwnerMetaRow | null;
  streams: WorkspaceMessengerCachedStream[];
  topics: WorkspaceMessengerCachedTopic[];
  conversations: WorkspaceMessengerCachedConversation[];
  folders: WorkspaceMessengerCachedFolder[];
  folderItems: WorkspaceMessengerCachedFolderItem[];
  users: WorkspaceMessengerCachedUser[];
  streamBindings: WorkspaceMessengerCachedStreamBinding[];
  realtimeCursor: WorkspaceMessengerRealtimeCursorRow | null;
}

export interface WorkspaceMessengerCatalogCacheWriteSnapshot {
  streams?: readonly WorkspaceMessengerCachedStream[];
  topics?: readonly WorkspaceMessengerCachedTopic[];
  conversations?: readonly WorkspaceMessengerCachedConversation[];
  folders?: readonly WorkspaceMessengerCachedFolder[];
  folderItems?: readonly WorkspaceMessengerCachedFolderItem[];
  users?: readonly WorkspaceMessengerCachedUser[];
  streamBindings?: readonly WorkspaceMessengerCachedStreamBinding[];
  lastHydratedAt?: number | null;
}

export interface WorkspaceMessengerCatalogCacheWriteOptions {
  mode?: "partial" | "reconcile";
  reconcileFence?: number;
}

export interface WorkspaceMessengerConversationMessagePage {
  messages: readonly WorkspaceMessengerCachedMessage[];
  conversationIds?: readonly string[];
  nextPageMarker?: string | null;
  hasMore?: boolean;
  reachedOldest?: boolean;
  reachedNewest?: boolean;
  hasGaps?: boolean;
  windowSize?: number;
  lastSyncedAt?: number | null;
  retentionLimit?: number;
}

export interface WorkspaceMessengerConversationMessageWindow {
  messages: WorkspaceMessengerCachedMessage[];
  window: WorkspaceMessengerMessageWindowRow | null;
}

function isCachedMessageWithPayload(value: unknown): value is WorkspaceMessengerCachedMessage {
  if (value == null || typeof value !== "object") return false;
  const message = value as { payload?: unknown };
  const payload = message.payload;
  return (
    payload != null &&
    typeof payload === "object" &&
    (payload as { kind?: unknown }).kind === "markdown" &&
    typeof (payload as { content?: unknown }).content === "string"
  );
}

export interface WorkspaceMessengerSearchResultWrite {
  queryHash: string;
  query: string;
  filters: unknown;
  resultMessageUuids: readonly string[];
  createdAt?: number;
  expiresAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;
let lastCatalogCacheUpdatedAt = 0;

function idbError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error("indexedDB error", { cause: reason });
}

function isIndexedDBAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(idbError(request.error));
    request.onsuccess = () => resolve(request.result);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.onerror = () => reject(idbError(transaction.error));
    transaction.onabort = () => reject(idbError(transaction.error));
    transaction.oncomplete = () => resolve();
  });
}

function nowIso(): string {
  return new Date().toISOString();
}

function nextCatalogCacheUpdatedAt(): number {
  const value = Math.max(Date.now(), lastCatalogCacheUpdatedAt + 1);
  lastCatalogCacheUpdatedAt = value;
  return value;
}

export function createMessengerCatalogCacheReconcileFence(): number {
  return nextCatalogCacheUpdatedAt();
}

function cacheRowId(ownerKey: string, id: string): string {
  return `${ownerKey}:${id}`;
}

// Ключ реакции строится из минимальной уникальной тройки Workspace-контракта:
// один пользователь может иметь только одну реакцию с данным emojiName на
// конкретном сообщении, а reactionUuid нужен уже для DELETE-запроса.
function ownMessageReactionRowId(ownerKey: string, messageUuid: string, emojiName: string): string {
  return `${ownerKey}:${messageUuid}:${emojiName}`;
}

function readBoundaryRowId(ownerKey: string, streamUuid: string, topicUuid: string): string {
  return cacheRowId(ownerKey, `${streamUuid}:${topicUuid}`);
}

export function workspaceMessengerMessageOrderKey(message: {
  createdAt: string;
  uuid: string;
}): string {
  return `${message.createdAt}${ORDER_KEY_SEPARATOR}${message.uuid}`;
}

function messageBucketId(ownerKey: string, conversationId: string, messageUuid: string): string {
  return `${ownerKey}:${conversationId}:${messageUuid}`;
}

function composerDraftId(ownerKey: string, conversationId: string): string {
  return `${ownerKey}:${conversationId}`;
}

function composerDraftRecordId(ownerKey: string, draftUuid: string): string {
  return `${ownerKey}:${draftUuid}`;
}

function streamConversationId(streamUuid: string): string {
  return `stream:${streamUuid}`;
}

function topicConversationId(streamUuid: string, topicUuid: string): string {
  return `topic:${streamUuid}:${topicUuid}`;
}

function conversationKind(conversationId: string): WorkspaceMessengerConversationKind {
  return conversationId.startsWith("topic:") ? "topic" : "stream";
}

function conversationTopicUuid(
  conversation: WorkspaceMessengerCachedConversation,
): string | undefined {
  if (conversation.topicUuid != null) return conversation.topicUuid;
  const parts = conversation.id.split(":");
  return parts[0] === "topic" && parts.length === 3 ? parts[2] : undefined;
}

function updatedAtOrNow(value: string | null | undefined): string {
  return value ?? nowIso();
}

function emptyCatalogSnapshot(): WorkspaceMessengerCatalogCacheSnapshot {
  return {
    ownerMeta: null,
    streams: [],
    topics: [],
    conversations: [],
    folders: [],
    folderItems: [],
    users: [],
    streamBindings: [],
    realtimeCursor: null,
  };
}

export function openWorkspaceMessengerCacheDb(): Promise<IDBDatabase> {
  if (!isIndexedDBAvailable()) {
    return Promise.reject(new Error("indexedDB unavailable"));
  }

  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => {
      dbPromise = null;
      reject(idbError(request.error));
    };
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      runWorkspaceMessengerCacheDbUpgrade(request.result, request.transaction);
    };
  });

  return dbPromise;
}

/** Test helper: resets singleton after database deletion. */
export function resetWorkspaceMessengerCacheDbSingletonForTests(): void {
  dbPromise = null;
  lastCatalogCacheUpdatedAt = 0;
}

/** Drops the Workspace messenger cache database and resets the open-connection singleton. */
export async function deleteWorkspaceMessengerCacheDatabase(): Promise<void> {
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
    const request = indexedDB.deleteDatabase(DB_NAME);
    let settled = false;
    const finishOk = (): void => {
      if (settled) return;
      settled = true;
      resolve();
    };
    request.onsuccess = () => finishOk();
    request.onerror = () => {
      if (settled) return;
      settled = true;
      reject(idbError(request.error));
    };
    request.onblocked = () => {
      globalThis.setTimeout(() => finishOk(), IDB_DELETE_BLOCKED_TIMEOUT_MS);
    };
  });
}

export async function deleteWorkspaceMessengerOwnerCache(ownerKey: string): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = await openWorkspaceMessengerCacheDb();
    const stores = WORKSPACE_MESSENGER_CACHE_STORES;
    const storeNames = [
      stores.ownerMeta,
      stores.streams,
      stores.topics,
      stores.conversations,
      stores.folders,
      stores.folderItems,
      stores.users,
      stores.streamBindings,
      stores.messages,
      stores.messageBuckets,
      stores.messageWindows,
      stores.ownMessageReactions,
      stores.realtimeCursor,
      stores.searchResults,
      stores.composerDrafts,
      stores.readBoundaries,
    ];
    const idsByStore = await Promise.all(
      storeNames.map(async (storeName) => {
        if (storeName === stores.ownerMeta || storeName === stores.realtimeCursor) {
          return { storeName, ids: [ownerKey] };
        }
        return { storeName, ids: await readRowIdsByOwner(db, ownerKey, storeName) };
      }),
    );
    const transaction = db.transaction(storeNames, "readwrite");
    for (const { storeName, ids } of idsByStore) {
      const store = transaction.objectStore(storeName);
      for (const id of ids) {
        store.delete(id);
      }
    }
    await transactionDone(transaction);
  } catch {
    return;
  }
}

async function readRowsByOwner<TRow>(
  db: IDBDatabase,
  ownerKey: string,
  storeName: string,
): Promise<TRow[]> {
  const transaction = db.transaction(storeName, "readonly");
  const index = transaction.objectStore(storeName).index("byOwner");
  return requestToPromise(index.getAll(IDBKeyRange.only(ownerKey)) as IDBRequest<TRow[]>);
}

async function readRowIdsByOwner(
  db: IDBDatabase,
  ownerKey: string,
  storeName: string,
): Promise<string[]> {
  const rows = await readRowsByOwner<{ id: string }>(db, ownerKey, storeName);
  return rows.map((row) => row.id);
}

async function readOwnerMeta(
  db: IDBDatabase,
  ownerKey: string,
): Promise<WorkspaceMessengerCacheOwnerMetaRow | null> {
  const transaction = db.transaction(WORKSPACE_MESSENGER_CACHE_STORES.ownerMeta, "readonly");
  const request = transaction.objectStore(WORKSPACE_MESSENGER_CACHE_STORES.ownerMeta).get(ownerKey);
  return (
    ((await requestToPromise(request)) as WorkspaceMessengerCacheOwnerMetaRow | undefined) ?? null
  );
}

async function readRealtimeCursor(
  db: IDBDatabase,
  ownerKey: string,
): Promise<WorkspaceMessengerRealtimeCursorRow | null> {
  const transaction = db.transaction(WORKSPACE_MESSENGER_CACHE_STORES.realtimeCursor, "readonly");
  const request = transaction
    .objectStore(WORKSPACE_MESSENGER_CACHE_STORES.realtimeCursor)
    .get(ownerKey);
  return (
    ((await requestToPromise(request)) as WorkspaceMessengerRealtimeCursorRow | undefined) ?? null
  );
}

function toStreamRow(
  ownerKey: string,
  stream: WorkspaceMessengerCachedStream,
  cacheUpdatedAt: number,
): WorkspaceMessengerStreamCacheRow {
  return {
    id: cacheRowId(ownerKey, stream.uuid),
    ownerKey,
    streamUuid: stream.uuid,
    stream,
    updatedAt: updatedAtOrNow(stream.updatedAt),
    cacheUpdatedAt,
  };
}

function toTopicRow(
  ownerKey: string,
  topic: WorkspaceMessengerCachedTopic,
  cacheUpdatedAt: number,
): WorkspaceMessengerTopicCacheRow {
  return {
    id: cacheRowId(ownerKey, topic.uuid),
    ownerKey,
    topicUuid: topic.uuid,
    streamUuid: topic.streamUuid,
    topic,
    updatedAt: updatedAtOrNow(topic.updatedAt),
    cacheUpdatedAt,
  };
}

function toConversationRow(
  ownerKey: string,
  conversation: WorkspaceMessengerCachedConversation,
  cacheUpdatedAt: number,
): WorkspaceMessengerConversationCacheRow {
  return {
    id: cacheRowId(ownerKey, conversation.id),
    ownerKey,
    conversationId: conversation.id,
    kind: conversationKind(conversation.id),
    streamUuid: conversation.streamUuid,
    topicUuid: conversationTopicUuid(conversation),
    title: conversation.title ?? "",
    unreadCount: conversation.unreadCount ?? 0,
    lastMessageUuid: conversation.lastMessageUuid ?? null,
    conversation,
    updatedAt: updatedAtOrNow(conversation.updatedAt),
    cacheUpdatedAt,
  };
}

function toFolderRow(
  ownerKey: string,
  folder: WorkspaceMessengerCachedFolder,
  cacheUpdatedAt: number,
): WorkspaceMessengerFolderCacheRow {
  return {
    id: cacheRowId(ownerKey, folder.uuid),
    ownerKey,
    folderUuid: folder.uuid,
    folder,
    updatedAt: updatedAtOrNow(folder.updatedAt),
    cacheUpdatedAt,
  };
}

function toFolderItemRow(
  ownerKey: string,
  folderItem: WorkspaceMessengerCachedFolderItem,
  cacheUpdatedAt: number,
): WorkspaceMessengerFolderItemCacheRow {
  return {
    id: cacheRowId(ownerKey, folderItem.uuid),
    ownerKey,
    folderItemUuid: folderItem.uuid,
    folderUuid: folderItem.folderUuid,
    conversationId: folderItem.conversationId,
    streamUuid: folderItem.streamUuid,
    chatType: folderItem.chatType,
    orderIndex: folderItem.orderIndex ?? null,
    pinnedAt: folderItem.pinnedAt ?? null,
    folderItem,
    updatedAt: updatedAtOrNow(folderItem.updatedAt),
    cacheUpdatedAt,
  };
}

function toUserRow(
  ownerKey: string,
  user: WorkspaceMessengerCachedUser,
  cacheUpdatedAt: number,
): WorkspaceMessengerUserCacheRow {
  return {
    id: cacheRowId(ownerKey, user.uuid),
    ownerKey,
    userUuid: user.uuid,
    user,
    updatedAt: updatedAtOrNow(user.updatedAt),
    cacheUpdatedAt,
  };
}

function toStreamBindingRow(
  ownerKey: string,
  streamBinding: WorkspaceMessengerCachedStreamBinding,
  cacheUpdatedAt: number,
): WorkspaceMessengerStreamBindingCacheRow {
  return {
    id: cacheRowId(ownerKey, streamBinding.uuid),
    ownerKey,
    streamBindingUuid: streamBinding.uuid,
    streamUuid: streamBinding.streamUuid,
    streamBinding,
    updatedAt: updatedAtOrNow(streamBinding.updatedAt),
    cacheUpdatedAt,
  };
}

function toMessageRow(
  ownerKey: string,
  message: WorkspaceMessengerCachedMessage,
  previous?: WorkspaceMessengerMessageCacheRow,
): WorkspaceMessengerMessageCacheRow {
  return {
    id: cacheRowId(ownerKey, message.uuid),
    ownerKey,
    messageUuid: message.uuid,
    message,
    createdAt: message.createdAt,
    updatedAt: updatedAtOrNow(message.updatedAt),
    version: (previous?.version ?? 0) + 1,
  };
}

// Нормализация строки выполняется в одном месте: cacheUpdatedAt отражает момент
// локальной записи, а id и ownerKey всегда пересчитываются из параметров helper-а.
function toOwnMessageReactionRow(
  ownerKey: string,
  row: WorkspaceMessengerOwnMessageReactionCacheWrite,
): WorkspaceMessengerOwnMessageReactionCacheRow {
  return {
    id: ownMessageReactionRowId(ownerKey, row.messageUuid, row.emojiName),
    ownerKey,
    messageUuid: row.messageUuid,
    userUuid: row.userUuid,
    reactionUuid: row.reactionUuid,
    emojiName: row.emojiName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    cacheUpdatedAt: nextCatalogCacheUpdatedAt(),
  };
}

function bucketConversationIdsForMessage(
  message: WorkspaceMessengerCachedMessage,
  explicitConversationIds: readonly string[] = [],
): string[] {
  const ids = new Set<string>(explicitConversationIds);
  ids.add(message.conversationId);
  ids.add(streamConversationId(message.streamUuid));
  if (message.topicUuid.length > 0) {
    ids.add(topicConversationId(message.streamUuid, message.topicUuid));
  }
  return [...ids];
}

function toBucketRow(
  ownerKey: string,
  conversationId: string,
  message: WorkspaceMessengerCachedMessage,
): WorkspaceMessengerMessageBucketRow {
  return {
    id: messageBucketId(ownerKey, conversationId, message.uuid),
    ownerKey,
    conversationId,
    messageUuid: message.uuid,
    createdAt: message.createdAt,
    orderKey: workspaceMessengerMessageOrderKey(message),
  };
}

function sortBucketsAscending(
  rows: WorkspaceMessengerMessageBucketRow[],
): WorkspaceMessengerMessageBucketRow[] {
  return [...rows].sort((a, b) => a.orderKey.localeCompare(b.orderKey));
}

async function readConversationBuckets(
  db: IDBDatabase,
  ownerKey: string,
  conversationId: string,
): Promise<WorkspaceMessengerMessageBucketRow[]> {
  const transaction = db.transaction(WORKSPACE_MESSENGER_CACHE_STORES.messageBuckets, "readonly");
  const index = transaction
    .objectStore(WORKSPACE_MESSENGER_CACHE_STORES.messageBuckets)
    .index("byConversationOrder");
  const range = IDBKeyRange.bound(
    [ownerKey, conversationId, ""],
    [ownerKey, conversationId, "\uffff"],
  );
  const rows = (await requestToPromise(
    index.getAll(range),
  )) as WorkspaceMessengerMessageBucketRow[];
  return sortBucketsAscending(rows);
}

async function readMessageBucketsByMessage(
  db: IDBDatabase,
  ownerKey: string,
  messageUuid: string,
): Promise<WorkspaceMessengerMessageBucketRow[]> {
  const transaction = db.transaction(WORKSPACE_MESSENGER_CACHE_STORES.messageBuckets, "readonly");
  const index = transaction
    .objectStore(WORKSPACE_MESSENGER_CACHE_STORES.messageBuckets)
    .index("byMessage");
  const rows = (await requestToPromise(
    index.getAll(IDBKeyRange.only([ownerKey, messageUuid])),
  )) as WorkspaceMessengerMessageBucketRow[];
  return sortBucketsAscending(rows);
}

async function readMessageWindowRow(
  db: IDBDatabase,
  ownerKey: string,
  conversationId: string,
): Promise<WorkspaceMessengerMessageWindowRow | null> {
  const transaction = db.transaction(WORKSPACE_MESSENGER_CACHE_STORES.messageWindows, "readonly");
  const request = transaction
    .objectStore(WORKSPACE_MESSENGER_CACHE_STORES.messageWindows)
    .get(cacheRowId(ownerKey, conversationId));
  return (
    ((await requestToPromise(request)) as WorkspaceMessengerMessageWindowRow | undefined) ?? null
  );
}

async function readMessageRowsByUuid(
  db: IDBDatabase,
  ownerKey: string,
  messageUuids: readonly string[],
): Promise<Map<string, WorkspaceMessengerMessageCacheRow>> {
  if (messageUuids.length === 0) return new Map();

  const transaction = db.transaction(WORKSPACE_MESSENGER_CACHE_STORES.messages, "readonly");
  const store = transaction.objectStore(WORKSPACE_MESSENGER_CACHE_STORES.messages);
  const requests = messageUuids.map((messageUuid) =>
    requestToPromise(store.get(cacheRowId(ownerKey, messageUuid))),
  );
  const rows = (await Promise.all(requests)) as (WorkspaceMessengerMessageCacheRow | undefined)[];
  const map = new Map<string, WorkspaceMessengerMessageCacheRow>();
  for (const row of rows) {
    if (row != null) {
      map.set(row.messageUuid, row);
    }
  }
  return map;
}

async function readMessageRow(
  db: IDBDatabase,
  ownerKey: string,
  messageUuid: string,
): Promise<WorkspaceMessengerMessageCacheRow | undefined> {
  const rows = await readMessageRowsByUuid(db, ownerKey, [messageUuid]);
  return rows.get(messageUuid);
}

// Чтение своих реакций идет через compound index, потому что будущий runtime
// будет гидрировать видимое окно пачкой UUID сообщений, не делая full scan owner-а.
async function readOwnMessageReactionRowsByMessage(
  db: IDBDatabase,
  ownerKey: string,
  messageUuid: string,
): Promise<WorkspaceMessengerOwnMessageReactionCacheRow[]> {
  const transaction = db.transaction(
    WORKSPACE_MESSENGER_CACHE_STORES.ownMessageReactions,
    "readonly",
  );
  const index = transaction
    .objectStore(WORKSPACE_MESSENGER_CACHE_STORES.ownMessageReactions)
    .index("byOwnerMessage");
  return requestToPromise(index.getAll(IDBKeyRange.only([ownerKey, messageUuid]))) as Promise<
    WorkspaceMessengerOwnMessageReactionCacheRow[]
  >;
}

function buildWindowRow(
  ownerKey: string,
  conversationId: string,
  rows: readonly WorkspaceMessengerMessageBucketRow[],
  page: WorkspaceMessengerConversationMessagePage,
  previous: WorkspaceMessengerMessageWindowRow | null,
): WorkspaceMessengerMessageWindowRow {
  const sortedRows = sortBucketsAscending([...rows]);
  const oldestMessageUuid = sortedRows[0]?.messageUuid ?? previous?.oldestMessageUuid ?? null;
  const newestMessageUuid =
    sortedRows[sortedRows.length - 1]?.messageUuid ?? previous?.newestMessageUuid ?? null;

  return {
    id: cacheRowId(ownerKey, conversationId),
    ownerKey,
    conversationId,
    oldestMessageUuid,
    newestMessageUuid,
    nextPageMarker:
      page.nextPageMarker === undefined ? (previous?.nextPageMarker ?? null) : page.nextPageMarker,
    hasMore: page.hasMore ?? previous?.hasMore ?? false,
    reachedOldest: page.reachedOldest ?? previous?.reachedOldest ?? false,
    reachedNewest: page.reachedNewest ?? previous?.reachedNewest ?? true,
    hasGaps: page.hasGaps ?? previous?.hasGaps ?? false,
    windowSize: page.windowSize ?? sortedRows.length,
    lastSyncedAt: page.lastSyncedAt === undefined ? Date.now() : page.lastSyncedAt,
  };
}

interface CatalogUpsertOptions {
  force?: boolean;
  reconcileFence?: number;
}

function shouldUpsertCatalogRow(
  previous: { updatedAt: string; cacheUpdatedAt?: number } | undefined,
  incomingUpdatedAt: string | null | undefined,
  options: CatalogUpsertOptions = {},
): boolean {
  if (options.force === true || previous == null) return true;
  if (options.reconcileFence != null) {
    // A full response owns rows that predate its request. Realtime writes made
    // after that request keep precedence only while they are newer than it.
    if ((previous.cacheUpdatedAt ?? 0) <= options.reconcileFence) return true;
  }
  if (incomingUpdatedAt == null) return false;
  return incomingUpdatedAt >= previous.updatedAt;
}

function shouldApplyMessagePointer(
  row: { updatedAt: string; lastMessageCreatedAt?: string | null },
  messageCreatedAt: string,
): boolean {
  // Message activity has its own chronology and must not make catalog metadata
  // look newer than a later authoritative topic or stream snapshot.
  const currentPointerCreatedAt = row.lastMessageCreatedAt ?? row.updatedAt;
  return messageCreatedAt >= currentPointerCreatedAt;
}

function updateCatalogRowsAtomically<TRow extends { id: string }>(
  db: IDBDatabase,
  storeName: string,
  rows: readonly TRow[],
  update: (store: IDBObjectStore, previous: TRow | undefined, incoming: TRow) => void,
): Promise<void> {
  const transaction = db.transaction(storeName, "readwrite");
  const store = transaction.objectStore(storeName);
  for (const row of rows) {
    const request = store.get(row.id);
    request.onsuccess = () => {
      update(store, request.result as TRow | undefined, row);
    };
  }
  return transactionDone(transaction);
}

function updateRowById<TRow>(
  store: IDBObjectStore,
  id: string,
  update: (row: TRow) => TRow | null,
): void {
  const request = store.get(id);
  request.onsuccess = () => {
    const row = request.result as TRow | undefined;
    if (row == null) return;
    const nextRow = update(row);
    if (nextRow != null) store.put(nextRow);
  };
}

function updateRowsByOwner<TRow>(
  store: IDBObjectStore,
  ownerKey: string,
  update: (row: TRow) => TRow | null,
): void {
  const request = store.index("byOwner").openCursor(IDBKeyRange.only(ownerKey));
  request.onsuccess = () => {
    const cursor = request.result;
    if (cursor == null) return;
    const nextRow = update(cursor.value as TRow);
    if (nextRow != null) cursor.update(nextRow);
    cursor.continue();
  };
}

async function deleteMissingCatalogRows(
  db: IDBDatabase,
  ownerKey: string,
  storeName: string,
  incomingIds: ReadonlySet<string>,
  reconcileFence: number,
): Promise<void> {
  const transaction = db.transaction(storeName, "readwrite");
  const index = transaction.objectStore(storeName).index("byOwner");
  const request = index.openCursor(IDBKeyRange.only(ownerKey));

  request.onsuccess = () => {
    const cursor = request.result;
    if (cursor == null) return;

    const row = cursor.value as { id: string; cacheUpdatedAt?: number };
    const cacheUpdatedAt = row.cacheUpdatedAt ?? 0;
    if (!incomingIds.has(row.id) && cacheUpdatedAt <= reconcileFence) {
      cursor.delete();
    }
    cursor.continue();
  };

  await transactionDone(transaction);
}

async function upsertStreams(
  db: IDBDatabase,
  ownerKey: string,
  streams: readonly WorkspaceMessengerCachedStream[],
  options: CatalogUpsertOptions = {},
): Promise<void> {
  if (streams.length === 0) return;

  const stores = WORKSPACE_MESSENGER_CACHE_STORES;
  const cacheUpdatedAt = nextCatalogCacheUpdatedAt();
  const rows = streams.map((stream) => toStreamRow(ownerKey, stream, cacheUpdatedAt));
  await updateCatalogRowsAtomically<WorkspaceMessengerStreamCacheRow>(
    db,
    stores.streams,
    rows,
    (store, previous, row) => {
      if (shouldUpsertCatalogRow(previous, row.stream.updatedAt, options)) {
        store.put({
          ...row,
          lastMessageCreatedAt:
            previous != null && previous.stream.lastMessageUuid === row.stream.lastMessageUuid
              ? previous.lastMessageCreatedAt
              : undefined,
        });
      } else if (previous != null && previous.stream.color == null && row.stream.color != null) {
        store.put({
          ...previous,
          stream: { ...previous.stream, color: row.stream.color },
          cacheUpdatedAt,
        });
      }
    },
  );
}

async function upsertTopics(
  db: IDBDatabase,
  ownerKey: string,
  topics: readonly WorkspaceMessengerCachedTopic[],
  options: CatalogUpsertOptions = {},
): Promise<void> {
  if (topics.length === 0) return;

  const stores = WORKSPACE_MESSENGER_CACHE_STORES;
  const cacheUpdatedAt = nextCatalogCacheUpdatedAt();
  const rows = topics.map((topic) => toTopicRow(ownerKey, topic, cacheUpdatedAt));
  await updateCatalogRowsAtomically<WorkspaceMessengerTopicCacheRow>(
    db,
    stores.topics,
    rows,
    (store, previous, row) => {
      if (!shouldUpsertCatalogRow(previous, row.topic.updatedAt, options)) return;
      store.put({
        ...row,
        lastMessageCreatedAt:
          previous != null && previous.topic.lastMessageUuid === row.topic.lastMessageUuid
            ? previous.lastMessageCreatedAt
            : undefined,
      });
    },
  );
}

async function upsertConversations(
  db: IDBDatabase,
  ownerKey: string,
  conversations: readonly WorkspaceMessengerCachedConversation[],
  options: CatalogUpsertOptions = {},
): Promise<void> {
  if (conversations.length === 0) return;

  const stores = WORKSPACE_MESSENGER_CACHE_STORES;
  const cacheUpdatedAt = nextCatalogCacheUpdatedAt();
  const rows = conversations.map((conversation) =>
    toConversationRow(ownerKey, conversation, cacheUpdatedAt),
  );
  await updateCatalogRowsAtomically<WorkspaceMessengerConversationCacheRow>(
    db,
    stores.conversations,
    rows,
    (store, previous, row) => {
      if (!shouldUpsertCatalogRow(previous, row.conversation.updatedAt, options)) return;
      store.put({
        ...row,
        lastMessageCreatedAt:
          previous?.lastMessageUuid === row.lastMessageUuid
            ? previous.lastMessageCreatedAt
            : undefined,
      });
    },
  );
}

async function upsertFolders(
  db: IDBDatabase,
  ownerKey: string,
  folders: readonly WorkspaceMessengerCachedFolder[],
  options: CatalogUpsertOptions = {},
): Promise<void> {
  if (folders.length === 0) return;

  const stores = WORKSPACE_MESSENGER_CACHE_STORES;
  const cacheUpdatedAt = nextCatalogCacheUpdatedAt();
  const rows = folders.map((folder) => toFolderRow(ownerKey, folder, cacheUpdatedAt));
  await updateCatalogRowsAtomically<WorkspaceMessengerFolderCacheRow>(
    db,
    stores.folders,
    rows,
    (store, previous, row) => {
      if (shouldUpsertCatalogRow(previous, row.folder.updatedAt, options)) store.put(row);
    },
  );
}

async function upsertFolderItems(
  db: IDBDatabase,
  ownerKey: string,
  folderItems: readonly WorkspaceMessengerCachedFolderItem[],
  options: CatalogUpsertOptions = {},
): Promise<void> {
  if (folderItems.length === 0) return;

  const stores = WORKSPACE_MESSENGER_CACHE_STORES;
  const cacheUpdatedAt = nextCatalogCacheUpdatedAt();
  const rows = folderItems.map((folderItem) =>
    toFolderItemRow(ownerKey, folderItem, cacheUpdatedAt),
  );
  await updateCatalogRowsAtomically<WorkspaceMessengerFolderItemCacheRow>(
    db,
    stores.folderItems,
    rows,
    (store, previous, row) => {
      if (shouldUpsertCatalogRow(previous, row.folderItem.updatedAt, options)) store.put(row);
    },
  );
}

async function upsertUsers(
  db: IDBDatabase,
  ownerKey: string,
  users: readonly WorkspaceMessengerCachedUser[],
  options: CatalogUpsertOptions = {},
): Promise<void> {
  if (users.length === 0) return;

  const stores = WORKSPACE_MESSENGER_CACHE_STORES;
  const cacheUpdatedAt = nextCatalogCacheUpdatedAt();
  const rows = users.map((user) => toUserRow(ownerKey, user, cacheUpdatedAt));
  await updateCatalogRowsAtomically<WorkspaceMessengerUserCacheRow>(
    db,
    stores.users,
    rows,
    (store, previous, row) => {
      if (shouldUpsertCatalogRow(previous, row.user.updatedAt, options)) store.put(row);
    },
  );
}

async function upsertStreamBindings(
  db: IDBDatabase,
  ownerKey: string,
  streamBindings: readonly WorkspaceMessengerCachedStreamBinding[],
  options: CatalogUpsertOptions = {},
): Promise<void> {
  if (streamBindings.length === 0) return;

  const stores = WORKSPACE_MESSENGER_CACHE_STORES;
  const cacheUpdatedAt = nextCatalogCacheUpdatedAt();
  const rows = streamBindings.map((streamBinding) =>
    toStreamBindingRow(ownerKey, streamBinding, cacheUpdatedAt),
  );
  await updateCatalogRowsAtomically<WorkspaceMessengerStreamBindingCacheRow>(
    db,
    stores.streamBindings,
    rows,
    (store, previous, row) => {
      if (shouldUpsertCatalogRow(previous, row.streamBinding.updatedAt, options)) store.put(row);
    },
  );
}

async function writeCatalogCollection<TItem>(
  db: IDBDatabase,
  ownerKey: string,
  storeName: string,
  items: readonly TItem[] | undefined,
  upsert: (
    db: IDBDatabase,
    ownerKey: string,
    items: readonly TItem[],
    options?: CatalogUpsertOptions,
  ) => Promise<void>,
  getCacheId: (ownerKey: string, item: TItem) => string,
  options: WorkspaceMessengerCatalogCacheWriteOptions,
  reconcileFence: number,
): Promise<void> {
  if (items === undefined) return;

  await upsert(db, ownerKey, items, options.mode === "reconcile" ? { reconcileFence } : undefined);
  if (options.mode !== "reconcile") return;

  await deleteMissingCatalogRows(
    db,
    ownerKey,
    storeName,
    new Set(items.map((item) => getCacheId(ownerKey, item))),
    reconcileFence,
  );
}

export async function readMessengerCatalogCache(
  ownerKey: string,
): Promise<WorkspaceMessengerCatalogCacheSnapshot> {
  if (!isIndexedDBAvailable()) return emptyCatalogSnapshot();

  try {
    const db = await openWorkspaceMessengerCacheDb();
    const stores = WORKSPACE_MESSENGER_CACHE_STORES;
    const [
      ownerMeta,
      streamRows,
      topicRows,
      conversationRows,
      folderRows,
      folderItemRows,
      streamBindingRows,
      realtimeCursor,
    ] = await Promise.all([
      readOwnerMeta(db, ownerKey),
      readRowsByOwner<WorkspaceMessengerStreamCacheRow>(db, ownerKey, stores.streams),
      readRowsByOwner<WorkspaceMessengerTopicCacheRow>(db, ownerKey, stores.topics),
      readRowsByOwner<WorkspaceMessengerConversationCacheRow>(db, ownerKey, stores.conversations),
      readRowsByOwner<WorkspaceMessengerFolderCacheRow>(db, ownerKey, stores.folders),
      readRowsByOwner<WorkspaceMessengerFolderItemCacheRow>(db, ownerKey, stores.folderItems),
      readRowsByOwner<WorkspaceMessengerStreamBindingCacheRow>(db, ownerKey, stores.streamBindings),
      readRealtimeCursor(db, ownerKey),
    ]);

    return {
      ownerMeta,
      streams: streamRows.map((row) => row.stream),
      topics: topicRows.map((row) => row.topic),
      conversations: conversationRows.map((row) => row.conversation),
      folders: folderRows.map((row) => row.folder),
      folderItems: folderItemRows.map((row) => row.folderItem),
      users: [],
      streamBindings: streamBindingRows.map((row) => row.streamBinding),
      realtimeCursor,
    };
  } catch {
    return emptyCatalogSnapshot();
  }
}

export async function writeMessengerCatalogCache(
  ownerKey: string,
  snapshot: WorkspaceMessengerCatalogCacheWriteSnapshot,
  options: WorkspaceMessengerCatalogCacheWriteOptions = {},
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = await openWorkspaceMessengerCacheDb();
    const stores = WORKSPACE_MESSENGER_CACHE_STORES;
    const reconcileFence =
      options.mode === "reconcile"
        ? (options.reconcileFence ?? createMessengerCatalogCacheReconcileFence())
        : 0;
    const transaction = db.transaction(stores.ownerMeta, "readwrite");

    transaction.objectStore(stores.ownerMeta).put({
      ownerKey,
      schemaVersion: DB_VERSION,
      lastHydratedAt: snapshot.lastHydratedAt ?? Date.now(),
      lastCompactedAt: null,
    } satisfies WorkspaceMessengerCacheOwnerMetaRow);
    await transactionDone(transaction);

    await Promise.all([
      writeCatalogCollection(
        db,
        ownerKey,
        stores.streams,
        snapshot.streams,
        upsertStreams,
        (key, stream) => cacheRowId(key, stream.uuid),
        options,
        reconcileFence,
      ),
      writeCatalogCollection(
        db,
        ownerKey,
        stores.topics,
        snapshot.topics,
        upsertTopics,
        (key, topic) => cacheRowId(key, topic.uuid),
        options,
        reconcileFence,
      ),
      writeCatalogCollection(
        db,
        ownerKey,
        stores.conversations,
        snapshot.conversations,
        upsertConversations,
        (key, conversation) => cacheRowId(key, conversation.id),
        options,
        reconcileFence,
      ),
      writeCatalogCollection(
        db,
        ownerKey,
        stores.folders,
        snapshot.folders,
        upsertFolders,
        (key, folder) => cacheRowId(key, folder.uuid),
        options,
        reconcileFence,
      ),
      writeCatalogCollection(
        db,
        ownerKey,
        stores.folderItems,
        snapshot.folderItems,
        upsertFolderItems,
        (key, folderItem) => cacheRowId(key, folderItem.uuid),
        options,
        reconcileFence,
      ),
      writeCatalogCollection(
        db,
        ownerKey,
        stores.streamBindings,
        snapshot.streamBindings,
        upsertStreamBindings,
        (key, streamBinding) => cacheRowId(key, streamBinding.uuid),
        options,
        reconcileFence,
      ),
    ]);
  } catch {
    return;
  }
}

export async function upsertMessengerStreamsCache(
  ownerKey: string,
  streams: readonly WorkspaceMessengerCachedStream[],
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = await openWorkspaceMessengerCacheDb();
    await upsertStreams(db, ownerKey, streams);
  } catch (error) {
    logCacheWriteFailure("upsert-streams", error);
  }
}

export async function upsertMessengerTopicsCache(
  ownerKey: string,
  topics: readonly WorkspaceMessengerCachedTopic[],
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = await openWorkspaceMessengerCacheDb();
    await upsertTopics(db, ownerKey, topics);
  } catch (error) {
    logCacheWriteFailure("upsert-topics", error);
  }
}

export async function upsertMessengerConversationsCache(
  ownerKey: string,
  conversations: readonly WorkspaceMessengerCachedConversation[],
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = await openWorkspaceMessengerCacheDb();
    await upsertConversations(db, ownerKey, conversations);
  } catch (error) {
    logCacheWriteFailure("upsert-conversations", error);
  }
}

export async function upsertMessengerFolderSnapshotsCache(
  ownerKey: string,
  folders: readonly WorkspaceMessengerCachedFolder[],
  folderItems: readonly WorkspaceMessengerCachedFolderItem[] = [],
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = await openWorkspaceMessengerCacheDb();
    await Promise.all([
      upsertFolders(db, ownerKey, folders),
      upsertFolderItems(db, ownerKey, folderItems),
    ]);
  } catch {
    return;
  }
}

export async function upsertMessengerUsersCache(
  ownerKey: string,
  users: readonly WorkspaceMessengerCachedUser[],
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = await openWorkspaceMessengerCacheDb();
    await upsertUsers(db, ownerKey, users);
  } catch {
    return;
  }
}

export async function upsertMessengerStreamBindingsCache(
  ownerKey: string,
  streamBindings: readonly WorkspaceMessengerCachedStreamBinding[],
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = await openWorkspaceMessengerCacheDb();
    await upsertStreamBindings(db, ownerKey, streamBindings);
  } catch {
    return;
  }
}

function folderWithRemovedItems(
  folder: WorkspaceMessengerCachedFolder,
  shouldRemove: (item: WorkspaceMessengerCachedFolderItem) => boolean,
): WorkspaceMessengerCachedFolder {
  const folderWithItems = folder as WorkspaceMessengerCachedFolder & {
    items?: WorkspaceMessengerCachedFolderItem[];
  };
  if (folderWithItems.items == null) return folder;
  return {
    ...folderWithItems,
    items: folderWithItems.items.filter((item) => !shouldRemove(item)),
  };
}

export async function deleteMessengerStreamCatalogCache(
  ownerKey: string,
  streamUuid: string,
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = await openWorkspaceMessengerCacheDb();
    const stores = WORKSPACE_MESSENGER_CACHE_STORES;
    const [topicRows, conversationRows, streamBindingRows, folderItemRows, folderRows] =
      await Promise.all([
        readRowsByOwner<WorkspaceMessengerTopicCacheRow>(db, ownerKey, stores.topics),
        readRowsByOwner<WorkspaceMessengerConversationCacheRow>(db, ownerKey, stores.conversations),
        readRowsByOwner<WorkspaceMessengerStreamBindingCacheRow>(
          db,
          ownerKey,
          stores.streamBindings,
        ),
        readRowsByOwner<WorkspaceMessengerFolderItemCacheRow>(db, ownerKey, stores.folderItems),
        readRowsByOwner<WorkspaceMessengerFolderCacheRow>(db, ownerKey, stores.folders),
      ]);
    const folderItemIdsToDelete = folderItemRows
      .filter((row) => row.streamUuid === streamUuid)
      .map((row) => row.id);
    const cacheUpdatedAt = nextCatalogCacheUpdatedAt();
    const transaction = db.transaction(
      [
        stores.streams,
        stores.topics,
        stores.conversations,
        stores.streamBindings,
        stores.folderItems,
        stores.folders,
      ],
      "readwrite",
    );
    transaction.objectStore(stores.streams).delete(cacheRowId(ownerKey, streamUuid));
    const topicStore = transaction.objectStore(stores.topics);
    for (const row of topicRows) {
      if (row.streamUuid === streamUuid) {
        topicStore.delete(row.id);
      }
    }
    const conversationStore = transaction.objectStore(stores.conversations);
    for (const row of conversationRows) {
      if (row.streamUuid === streamUuid) {
        conversationStore.delete(row.id);
      }
    }
    const streamBindingStore = transaction.objectStore(stores.streamBindings);
    for (const row of streamBindingRows) {
      if (row.streamUuid === streamUuid) {
        streamBindingStore.delete(row.id);
      }
    }
    const folderItemStore = transaction.objectStore(stores.folderItems);
    for (const id of folderItemIdsToDelete) {
      folderItemStore.delete(id);
    }
    const folderStore = transaction.objectStore(stores.folders);
    for (const row of folderRows) {
      folderStore.put({
        ...row,
        cacheUpdatedAt,
        folder: folderWithRemovedItems(row.folder, (item) => item.streamUuid === streamUuid),
      });
    }
    await transactionDone(transaction);
  } catch {
    return;
  }
}

export async function deleteMessengerStreamBindingCatalogCache(
  ownerKey: string,
  streamBindingUuid: string,
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = await openWorkspaceMessengerCacheDb();
    const stores = WORKSPACE_MESSENGER_CACHE_STORES;
    const transaction = db.transaction(stores.streamBindings, "readwrite");
    transaction.objectStore(stores.streamBindings).delete(cacheRowId(ownerKey, streamBindingUuid));
    await transactionDone(transaction);
  } catch {
    return;
  }
}

export async function deleteMessengerTopicCatalogCache(
  ownerKey: string,
  topicUuid: string,
  streamUuid: string,
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = await openWorkspaceMessengerCacheDb();
    const stores = WORKSPACE_MESSENGER_CACHE_STORES;
    const conversationId = topicConversationId(streamUuid, topicUuid);
    const transaction = db.transaction([stores.topics, stores.conversations], "readwrite");
    transaction.objectStore(stores.topics).delete(cacheRowId(ownerKey, topicUuid));
    transaction.objectStore(stores.conversations).delete(cacheRowId(ownerKey, conversationId));
    await transactionDone(transaction);
  } catch {
    return;
  }
}

export async function deleteMessengerFolderCatalogCache(
  ownerKey: string,
  folderUuid: string,
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = await openWorkspaceMessengerCacheDb();
    const stores = WORKSPACE_MESSENGER_CACHE_STORES;
    const folderItems = await readRowsByOwner<WorkspaceMessengerFolderItemCacheRow>(
      db,
      ownerKey,
      stores.folderItems,
    );
    const transaction = db.transaction([stores.folders, stores.folderItems], "readwrite");
    transaction.objectStore(stores.folders).delete(cacheRowId(ownerKey, folderUuid));
    const folderItemStore = transaction.objectStore(stores.folderItems);
    for (const row of folderItems) {
      if (row.folderUuid === folderUuid) {
        folderItemStore.delete(row.id);
      }
    }
    await transactionDone(transaction);
  } catch {
    return;
  }
}

export async function deleteMessengerFolderItemCatalogCache(
  ownerKey: string,
  folderItemUuid: string,
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = await openWorkspaceMessengerCacheDb();
    const stores = WORKSPACE_MESSENGER_CACHE_STORES;
    const folderRows = await readRowsByOwner<WorkspaceMessengerFolderCacheRow>(
      db,
      ownerKey,
      stores.folders,
    );
    const cacheUpdatedAt = nextCatalogCacheUpdatedAt();
    const transaction = db.transaction([stores.folderItems, stores.folders], "readwrite");
    transaction.objectStore(stores.folderItems).delete(cacheRowId(ownerKey, folderItemUuid));
    const folderStore = transaction.objectStore(stores.folders);
    for (const row of folderRows) {
      folderStore.put({
        ...row,
        cacheUpdatedAt,
        folder: folderWithRemovedItems(row.folder, (item) => item.uuid === folderItemUuid),
      });
    }
    await transactionDone(transaction);
  } catch {
    return;
  }
}

function messageWindowAfterBucketDelete(
  ownerKey: string,
  conversationId: string,
  remainingBuckets: readonly WorkspaceMessengerMessageBucketRow[],
  previous: WorkspaceMessengerMessageWindowRow | null,
): WorkspaceMessengerMessageWindowRow {
  const sortedBuckets = sortBucketsAscending([...remainingBuckets]);
  return {
    id: cacheRowId(ownerKey, conversationId),
    ownerKey,
    conversationId,
    oldestMessageUuid: sortedBuckets[0]?.messageUuid ?? null,
    newestMessageUuid: sortedBuckets[sortedBuckets.length - 1]?.messageUuid ?? null,
    nextPageMarker: previous?.nextPageMarker ?? null,
    hasMore: previous?.hasMore ?? false,
    reachedOldest: previous?.reachedOldest ?? false,
    reachedNewest: previous?.reachedNewest ?? true,
    hasGaps: previous?.hasGaps ?? false,
    windowSize: sortedBuckets.length,
    lastSyncedAt: Date.now(),
  };
}

export async function deleteCachedTopicMessageBuckets(
  ownerKey: string,
  streamUuid: string,
  topicUuid: string,
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = await openWorkspaceMessengerCacheDb();
    const topicConversation = topicConversationId(streamUuid, topicUuid);
    const streamConversation = streamConversationId(streamUuid);
    const [topicBuckets, streamBuckets, previousStreamWindow] = await Promise.all([
      readConversationBuckets(db, ownerKey, topicConversation),
      readConversationBuckets(db, ownerKey, streamConversation),
      readMessageWindowRow(db, ownerKey, streamConversation),
    ]);
    const candidateMessageUuids = [
      ...new Set([...topicBuckets, ...streamBuckets].map((bucket) => bucket.messageUuid)),
    ];
    const messageRows = await readMessageRowsByUuid(db, ownerKey, candidateMessageUuids);
    const bucketIdsToDelete = new Set<string>();
    const deletedMessageUuids = new Set<string>();
    for (const bucket of topicBuckets) {
      bucketIdsToDelete.add(bucket.id);
      deletedMessageUuids.add(bucket.messageUuid);
    }
    for (const bucket of streamBuckets) {
      const message = messageRows.get(bucket.messageUuid)?.message;
      if (message?.streamUuid === streamUuid && message.topicUuid === topicUuid) {
        bucketIdsToDelete.add(bucket.id);
        deletedMessageUuids.add(bucket.messageUuid);
      }
    }
    const stores = WORKSPACE_MESSENGER_CACHE_STORES;
    if (bucketIdsToDelete.size === 0) {
      const transaction = db.transaction(stores.messageWindows, "readwrite");
      transaction
        .objectStore(stores.messageWindows)
        .delete(cacheRowId(ownerKey, topicConversation));
      await transactionDone(transaction);
      return;
    }

    const allBucketsByMessage = new Map<string, WorkspaceMessengerMessageBucketRow[]>();
    await Promise.all(
      [...deletedMessageUuids].map(async (messageUuid) => {
        allBucketsByMessage.set(
          messageUuid,
          await readMessageBucketsByMessage(db, ownerKey, messageUuid),
        );
      }),
    );
    const messageUuidsToDelete = [...deletedMessageUuids].filter((messageUuid) => {
      const buckets = allBucketsByMessage.get(messageUuid) ?? [];
      return buckets.length > 0 && buckets.every((bucket) => bucketIdsToDelete.has(bucket.id));
    });
    const remainingStreamBuckets = streamBuckets.filter(
      (bucket) => !bucketIdsToDelete.has(bucket.id),
    );
    const transaction = db.transaction(
      [stores.messages, stores.messageBuckets, stores.messageWindows],
      "readwrite",
    );
    const bucketStore = transaction.objectStore(stores.messageBuckets);
    for (const bucketId of bucketIdsToDelete) {
      bucketStore.delete(bucketId);
    }
    const messageStore = transaction.objectStore(stores.messages);
    for (const messageUuid of messageUuidsToDelete) {
      messageStore.delete(cacheRowId(ownerKey, messageUuid));
    }
    const windowStore = transaction.objectStore(stores.messageWindows);
    windowStore.delete(cacheRowId(ownerKey, topicConversation));
    windowStore.put(
      messageWindowAfterBucketDelete(
        ownerKey,
        streamConversation,
        remainingStreamBuckets,
        previousStreamWindow,
      ),
    );
    await transactionDone(transaction);
    await deleteOwnMessageReactionsForMessages(ownerKey, messageUuidsToDelete);
  } catch {
    return;
  }
}

export async function deleteCachedStreamMessageBuckets(
  ownerKey: string,
  streamUuid: string,
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = await openWorkspaceMessengerCacheDb();
    const stores = WORKSPACE_MESSENGER_CACHE_STORES;
    const [messageRows, bucketRows, topicRows] = await Promise.all([
      readRowsByOwner<WorkspaceMessengerMessageCacheRow>(db, ownerKey, stores.messages),
      readRowsByOwner<WorkspaceMessengerMessageBucketRow>(db, ownerKey, stores.messageBuckets),
      readRowsByOwner<WorkspaceMessengerTopicCacheRow>(db, ownerKey, stores.topics),
    ]);
    const messageUuidsToDelete = new Set(
      messageRows
        .filter((row) => row.message.streamUuid === streamUuid)
        .map((row) => row.messageUuid),
    );
    const bucketsToDelete = bucketRows.filter((bucket) =>
      messageUuidsToDelete.has(bucket.messageUuid),
    );
    const conversationIdsToDelete = new Set(bucketsToDelete.map((bucket) => bucket.conversationId));
    conversationIdsToDelete.add(streamConversationId(streamUuid));
    for (const row of topicRows) {
      if (row.streamUuid === streamUuid) {
        conversationIdsToDelete.add(topicConversationId(streamUuid, row.topicUuid));
      }
    }
    for (const row of messageRows) {
      if (row.message.streamUuid === streamUuid && row.message.topicUuid.length > 0) {
        conversationIdsToDelete.add(topicConversationId(streamUuid, row.message.topicUuid));
      }
    }

    const transaction = db.transaction(
      [stores.messages, stores.messageBuckets, stores.messageWindows],
      "readwrite",
    );
    const bucketStore = transaction.objectStore(stores.messageBuckets);
    for (const bucket of bucketsToDelete) {
      bucketStore.delete(bucket.id);
    }
    const messageStore = transaction.objectStore(stores.messages);
    for (const messageUuid of messageUuidsToDelete) {
      messageStore.delete(cacheRowId(ownerKey, messageUuid));
    }
    const windowStore = transaction.objectStore(stores.messageWindows);
    for (const conversationId of conversationIdsToDelete) {
      windowStore.delete(cacheRowId(ownerKey, conversationId));
    }
    await transactionDone(transaction);
    await deleteOwnMessageReactionsForMessages(ownerKey, [...messageUuidsToDelete]);
  } catch {
    return;
  }
}

export async function applyMessengerMessagePointerCache(
  ownerKey: string,
  message: WorkspaceMessengerCachedMessage,
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = await openWorkspaceMessengerCacheDb();
    const stores = WORKSPACE_MESSENGER_CACHE_STORES;
    const streamId = cacheRowId(ownerKey, message.streamUuid);
    const topicId = cacheRowId(ownerKey, message.topicUuid);
    const streamConversation = streamConversationId(message.streamUuid);
    const conversationIds = [
      streamConversation,
      message.conversationId,
      topicConversationId(message.streamUuid, message.topicUuid),
    ];
    const transaction = db.transaction(
      [stores.streams, stores.topics, stores.conversations],
      "readwrite",
    );
    const cacheUpdatedAt = nextCatalogCacheUpdatedAt();
    updateRowById<WorkspaceMessengerStreamCacheRow>(
      transaction.objectStore(stores.streams),
      streamId,
      (row) =>
        shouldApplyMessagePointer(row, message.createdAt)
          ? {
              ...row,
              stream: { ...row.stream, lastMessageUuid: message.uuid },
              lastMessageCreatedAt: message.createdAt,
              cacheUpdatedAt,
            }
          : null,
    );
    updateRowById<WorkspaceMessengerTopicCacheRow>(
      transaction.objectStore(stores.topics),
      topicId,
      (row) =>
        shouldApplyMessagePointer(row, message.createdAt)
          ? {
              ...row,
              topic: { ...row.topic, lastMessageUuid: message.uuid },
              lastMessageCreatedAt: message.createdAt,
              cacheUpdatedAt,
            }
          : null,
    );
    const conversationStore = transaction.objectStore(stores.conversations);
    for (const conversationId of new Set(conversationIds)) {
      updateRowById<WorkspaceMessengerConversationCacheRow>(
        conversationStore,
        cacheRowId(ownerKey, conversationId),
        (row) =>
          shouldApplyMessagePointer(row, message.createdAt)
            ? {
                ...row,
                conversation: { ...row.conversation, lastMessageUuid: message.uuid },
                lastMessageUuid: message.uuid,
                lastMessageCreatedAt: message.createdAt,
                cacheUpdatedAt,
              }
            : null,
      );
    }
    await transactionDone(transaction);
  } catch {
    return;
  }
}

export async function clearMessengerMessagePointerCache(
  ownerKey: string,
  messageUuid: string,
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = await openWorkspaceMessengerCacheDb();
    const stores = WORKSPACE_MESSENGER_CACHE_STORES;
    const transaction = db.transaction(
      [stores.streams, stores.topics, stores.conversations],
      "readwrite",
    );
    const cacheUpdatedAt = nextCatalogCacheUpdatedAt();
    const streamStore = transaction.objectStore(stores.streams);
    updateRowsByOwner<WorkspaceMessengerStreamCacheRow>(streamStore, ownerKey, (row) => {
      if (row.stream.lastMessageUuid !== messageUuid) return null;
      return {
        ...row,
        stream: { ...row.stream, lastMessageUuid: null },
        lastMessageCreatedAt: null,
        cacheUpdatedAt,
      };
    });
    const topicStore = transaction.objectStore(stores.topics);
    updateRowsByOwner<WorkspaceMessengerTopicCacheRow>(topicStore, ownerKey, (row) => {
      if (row.topic.lastMessageUuid !== messageUuid) return null;
      return {
        ...row,
        topic: { ...row.topic, lastMessageUuid: null },
        lastMessageCreatedAt: null,
        cacheUpdatedAt,
      };
    });
    const conversationStore = transaction.objectStore(stores.conversations);
    updateRowsByOwner<WorkspaceMessengerConversationCacheRow>(
      conversationStore,
      ownerKey,
      (row) => {
        if (
          row.lastMessageUuid !== messageUuid &&
          row.conversation.lastMessageUuid !== messageUuid
        ) {
          return null;
        }
        return {
          ...row,
          lastMessageUuid: null,
          conversation: { ...row.conversation, lastMessageUuid: null },
          lastMessageCreatedAt: null,
          cacheUpdatedAt,
        };
      },
    );
    await transactionDone(transaction);
  } catch {
    return;
  }
}

export async function readConversationMessageWindow(
  ownerKey: string,
  conversationId: string,
): Promise<WorkspaceMessengerConversationMessageWindow> {
  if (!isIndexedDBAvailable()) return { messages: [], window: null };

  try {
    const db = await openWorkspaceMessengerCacheDb();
    const [buckets, window] = await Promise.all([
      readConversationBuckets(db, ownerKey, conversationId),
      readMessageWindowRow(db, ownerKey, conversationId),
    ]);
    const messageRows = await readMessageRowsByUuid(
      db,
      ownerKey,
      buckets.map((bucket) => bucket.messageUuid),
    );
    const messages = buckets
      .map((bucket) => messageRows.get(bucket.messageUuid)?.message)
      .filter(isCachedMessageWithPayload);

    return { messages, window };
  } catch {
    return { messages: [], window: null };
  }
}

export async function readCachedMessagesByUuids(
  ownerKey: string,
  messageUuids: readonly string[],
): Promise<WorkspaceMessengerCachedMessage[]> {
  if (!isIndexedDBAvailable() || messageUuids.length === 0) return [];

  try {
    const db = await openWorkspaceMessengerCacheDb();
    const messageRows = await readMessageRowsByUuid(db, ownerKey, messageUuids);
    return messageUuids
      .map((messageUuid) => messageRows.get(messageUuid)?.message)
      .filter(isCachedMessageWithPayload);
  } catch {
    return [];
  }
}

// Пачечное чтение возвращает только реакции текущего owner-а для явно
// запрошенных сообщений. Это важно для SWR: видимое окно может быть частичным,
// и cache не должен делать выводы о сообщениях, которых не было в запросе.
export async function readOwnMessageReactions(
  ownerKey: string,
  messageUuids: readonly string[],
): Promise<WorkspaceMessengerOwnMessageReactionCacheRow[]> {
  if (!isIndexedDBAvailable() || messageUuids.length === 0) return [];

  try {
    const db = await openWorkspaceMessengerCacheDb();
    const rowsByMessage = await Promise.all(
      [...new Set(messageUuids)].map((messageUuid) =>
        readOwnMessageReactionRowsByMessage(db, ownerKey, messageUuid),
      ),
    );
    return rowsByMessage.flat();
  } catch {
    return [];
  }
}

// Точечное чтение нужно для remove/toggle: если store после reload еще не знает
// reactionUuid, action-слой сможет найти его по устойчивой паре message+emoji.
export async function readOwnMessageReaction(
  ownerKey: string,
  messageUuid: string,
  emojiName: string,
): Promise<WorkspaceMessengerOwnMessageReactionCacheRow | null> {
  if (!isIndexedDBAvailable()) return null;

  try {
    const db = await openWorkspaceMessengerCacheDb();
    const transaction = db.transaction(
      WORKSPACE_MESSENGER_CACHE_STORES.ownMessageReactions,
      "readonly",
    );
    const request = transaction
      .objectStore(WORKSPACE_MESSENGER_CACHE_STORES.ownMessageReactions)
      .get(ownMessageReactionRowId(ownerKey, messageUuid, emojiName));
    return (
      ((await requestToPromise(request)) as
        | WorkspaceMessengerOwnMessageReactionCacheRow
        | undefined) ?? null
    );
  } catch {
    return null;
  }
}

// Ответ API по одному сообщению является авторитетным только для этого
// сообщения. Поэтому helper удаляет старые строки ровно по byOwnerMessage и не
// трогает реакции других сообщений того же owner-а.
export async function replaceOwnMessageReactionsForMessage(
  ownerKey: string,
  messageUuid: string,
  rows: readonly WorkspaceMessengerOwnMessageReactionCacheWrite[],
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = await openWorkspaceMessengerCacheDb();
    const previousRows = await readOwnMessageReactionRowsByMessage(db, ownerKey, messageUuid);
    const nextRows = rows.map((row) => toOwnMessageReactionRow(ownerKey, { ...row, messageUuid }));
    const transaction = db.transaction(
      WORKSPACE_MESSENGER_CACHE_STORES.ownMessageReactions,
      "readwrite",
    );
    const store = transaction.objectStore(WORKSPACE_MESSENGER_CACHE_STORES.ownMessageReactions);
    for (const row of previousRows) {
      store.delete(row.id);
    }
    for (const row of nextRows) {
      store.put(row);
    }
    await transactionDone(transaction);
  } catch {
    return;
  }
}

export async function replaceOwnMessageReactionsForOwner(
  ownerKey: string,
  rows: readonly WorkspaceMessengerOwnMessageReactionCacheWrite[],
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = await openWorkspaceMessengerCacheDb();
    const previousRows = await readRowsByOwner<WorkspaceMessengerOwnMessageReactionCacheRow>(
      db,
      ownerKey,
      WORKSPACE_MESSENGER_CACHE_STORES.ownMessageReactions,
    );
    const nextRows = rows.map((row) => toOwnMessageReactionRow(ownerKey, row));
    const transaction = db.transaction(
      WORKSPACE_MESSENGER_CACHE_STORES.ownMessageReactions,
      "readwrite",
    );
    const store = transaction.objectStore(WORKSPACE_MESSENGER_CACHE_STORES.ownMessageReactions);
    for (const row of previousRows) {
      store.delete(row.id);
    }
    for (const row of nextRows) {
      store.put(row);
    }
    await transactionDone(transaction);
  } catch {
    return;
  }
}

// Upsert используется после успешного create: новая reactionUuid сразу
// становится пригодной для будущего DELETE, не дожидаясь общего reload cache.
export async function upsertOwnMessageReaction(
  ownerKey: string,
  row: WorkspaceMessengerOwnMessageReactionCacheWrite,
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = await openWorkspaceMessengerCacheDb();
    const transaction = db.transaction(
      WORKSPACE_MESSENGER_CACHE_STORES.ownMessageReactions,
      "readwrite",
    );
    transaction
      .objectStore(WORKSPACE_MESSENGER_CACHE_STORES.ownMessageReactions)
      .put(toOwnMessageReactionRow(ownerKey, row));
    await transactionDone(transaction);
  } catch {
    return;
  }
}

// Удаление по message+emoji отражает пользовательское действие remove/toggle.
// reactionUuid в ключ не входит, потому что при конфликте или повторной
// гидрации нам важно очистить именно локальную проекцию emojiName.
export async function deleteOwnMessageReaction(
  ownerKey: string,
  messageUuid: string,
  emojiName: string,
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = await openWorkspaceMessengerCacheDb();
    const transaction = db.transaction(
      WORKSPACE_MESSENGER_CACHE_STORES.ownMessageReactions,
      "readwrite",
    );
    transaction
      .objectStore(WORKSPACE_MESSENGER_CACHE_STORES.ownMessageReactions)
      .delete(ownMessageReactionRowId(ownerKey, messageUuid, emojiName));
    await transactionDone(transaction);
  } catch {
    return;
  }
}

// Очистка одного сообщения нужна для message.deleted и для случая, когда SWR
// вернул пустой список собственных реакций на конкретное сообщение.
export async function deleteOwnMessageReactionsForMessage(
  ownerKey: string,
  messageUuid: string,
): Promise<void> {
  await deleteOwnMessageReactionsForMessages(ownerKey, [messageUuid]);
}

// Массовая очистка принимает только явный список сообщений. Она не сканирует
// все реакции owner-а, чтобы topic/stream cleanup не удалил строки сообщений,
// которые не входили в текущий набор удаляемых messageUuid.
export async function deleteOwnMessageReactionsForMessages(
  ownerKey: string,
  messageUuids: readonly string[],
): Promise<void> {
  if (!isIndexedDBAvailable() || messageUuids.length === 0) return;

  try {
    const db = await openWorkspaceMessengerCacheDb();
    const rowsByMessage = await Promise.all(
      [...new Set(messageUuids)].map((messageUuid) =>
        readOwnMessageReactionRowsByMessage(db, ownerKey, messageUuid),
      ),
    );
    const ids = rowsByMessage.flat().map((row) => row.id);
    if (ids.length === 0) return;

    const transaction = db.transaction(
      WORKSPACE_MESSENGER_CACHE_STORES.ownMessageReactions,
      "readwrite",
    );
    const store = transaction.objectStore(WORKSPACE_MESSENGER_CACHE_STORES.ownMessageReactions);
    for (const id of ids) {
      store.delete(id);
    }
    await transactionDone(transaction);
  } catch {
    return;
  }
}

export async function upsertCachedMessages(
  ownerKey: string,
  messages: readonly WorkspaceMessengerCachedMessage[],
): Promise<void> {
  if (!isIndexedDBAvailable() || messages.length === 0) return;

  try {
    const db = await openWorkspaceMessengerCacheDb();
    const previousRows = await readMessageRowsByUuid(
      db,
      ownerKey,
      messages.map((message) => message.uuid),
    );
    const transaction = db.transaction(WORKSPACE_MESSENGER_CACHE_STORES.messages, "readwrite");
    const messageStore = transaction.objectStore(WORKSPACE_MESSENGER_CACHE_STORES.messages);
    for (const message of messages) {
      messageStore.put(toMessageRow(ownerKey, message, previousRows.get(message.uuid)));
    }
    await transactionDone(transaction);
  } catch {
    return;
  }
}

export async function writeConversationMessagePage(
  ownerKey: string,
  conversationId: string,
  page: WorkspaceMessengerConversationMessagePage,
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = await openWorkspaceMessengerCacheDb();
    const [existingBuckets, previousWindow] = await Promise.all([
      readConversationBuckets(db, ownerKey, conversationId),
      readMessageWindowRow(db, ownerKey, conversationId),
    ]);
    const previousRows = await readMessageRowsByUuid(
      db,
      ownerKey,
      page.messages.map((message) => message.uuid),
    );
    const nextBucketsById = new Map<string, WorkspaceMessengerMessageBucketRow>();
    for (const bucket of existingBuckets) {
      nextBucketsById.set(bucket.id, bucket);
    }

    const stores = WORKSPACE_MESSENGER_CACHE_STORES;
    const transaction = db.transaction(
      [stores.messages, stores.messageBuckets, stores.messageWindows],
      "readwrite",
    );
    const messageStore = transaction.objectStore(stores.messages);
    const bucketStore = transaction.objectStore(stores.messageBuckets);

    for (const message of page.messages) {
      const previousRow = previousRows.get(message.uuid);
      messageStore.put(toMessageRow(ownerKey, message, previousRow));

      for (const bucketConversationId of bucketConversationIdsForMessage(
        message,
        page.conversationIds ?? [conversationId],
      )) {
        const bucketRow = toBucketRow(ownerKey, bucketConversationId, message);
        bucketStore.put(bucketRow);
        if (bucketConversationId === conversationId) {
          nextBucketsById.set(bucketRow.id, bucketRow);
        }
      }
    }

    const windowRow = buildWindowRow(
      ownerKey,
      conversationId,
      [...nextBucketsById.values()],
      page,
      previousWindow,
    );
    transaction.objectStore(stores.messageWindows).put(windowRow);
    await transactionDone(transaction);

    await applyConversationMessageRetention(
      ownerKey,
      conversationId,
      page.retentionLimit ?? DEFAULT_MESSAGE_BUCKET_RETENTION,
    );
  } catch {
    return;
  }
}

export async function patchCachedMessage(
  ownerKey: string,
  message: WorkspaceMessengerCachedMessage,
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = await openWorkspaceMessengerCacheDb();
    const [previousRow, existingBuckets] = await Promise.all([
      readMessageRow(db, ownerKey, message.uuid),
      readMessageBucketsByMessage(db, ownerKey, message.uuid),
    ]);
    const targetConversationIds =
      existingBuckets.length > 0
        ? existingBuckets.map((bucket) => bucket.conversationId)
        : bucketConversationIdsForMessage(message);
    const stores = WORKSPACE_MESSENGER_CACHE_STORES;
    const transaction = db.transaction([stores.messages, stores.messageBuckets], "readwrite");

    transaction.objectStore(stores.messages).put(toMessageRow(ownerKey, message, previousRow));
    const bucketStore = transaction.objectStore(stores.messageBuckets);
    for (const bucketConversationId of targetConversationIds) {
      bucketStore.put(toBucketRow(ownerKey, bucketConversationId, message));
    }

    await transactionDone(transaction);
  } catch {
    return;
  }
}

export async function markCachedMessagesRead(
  ownerKey: string,
  messageUuids: readonly string[],
  conversationIds: readonly string[] = [],
): Promise<void> {
  if (!isIndexedDBAvailable() || (messageUuids.length === 0 && conversationIds.length === 0)) {
    return;
  }

  try {
    const db = await openWorkspaceMessengerCacheDb();
    const stores = WORKSPACE_MESSENGER_CACHE_STORES;
    const transaction = db.transaction([stores.messages, stores.messageBuckets], "readwrite");
    const messageStore = transaction.objectStore(stores.messages);
    const bucketIndex = transaction.objectStore(stores.messageBuckets).index("byConversationOrder");
    const uniqueConversationIds = [...new Set(conversationIds)];
    const bucketRows = await Promise.all(
      uniqueConversationIds.map((conversationId) =>
        requestToPromise<WorkspaceMessengerMessageBucketRow[]>(
          bucketIndex.getAll(
            IDBKeyRange.bound([ownerKey, conversationId, ""], [ownerKey, conversationId, "\uffff"]),
          ),
        ),
      ),
    );
    const uniqueMessageUuids = new Set(messageUuids);
    for (const row of bucketRows.flat()) {
      if (row.ownerKey === ownerKey) {
        uniqueMessageUuids.add(row.messageUuid);
      }
    }
    const rows = await Promise.all(
      [...uniqueMessageUuids].map((messageUuid) =>
        requestToPromise<WorkspaceMessengerMessageCacheRow | undefined>(
          messageStore.get(cacheRowId(ownerKey, messageUuid)),
        ),
      ),
    );

    for (const row of rows) {
      if (row?.ownerKey !== ownerKey || row.message.read === true) continue;
      messageStore.put({
        ...row,
        message: {
          ...row.message,
          read: true,
        },
        version: row.version + 1,
      } satisfies WorkspaceMessengerMessageCacheRow);
    }

    await transactionDone(transaction);
  } catch (error) {
    logCacheWriteFailure("mark-messages-read", error);
  }
}

export async function readMessengerReadBoundaries(
  ownerKey: string,
): Promise<WorkspaceMessengerReadBoundaryCacheRow[]> {
  if (!isIndexedDBAvailable()) return [];

  try {
    const db = await openWorkspaceMessengerCacheDb();
    return await readRowsByOwner<WorkspaceMessengerReadBoundaryCacheRow>(
      db,
      ownerKey,
      WORKSPACE_MESSENGER_CACHE_STORES.readBoundaries,
    );
  } catch {
    return [];
  }
}

function compareReadBoundaryOrder(
  left: Pick<WorkspaceMessengerReadBoundaryCacheRow, "createdAt" | "messageUuid">,
  right: Pick<WorkspaceMessengerReadBoundaryCacheRow, "createdAt" | "messageUuid">,
): number {
  const createdAtOrder = left.createdAt.localeCompare(right.createdAt);
  return createdAtOrder !== 0 ? createdAtOrder : left.messageUuid.localeCompare(right.messageUuid);
}

function mergeReadBoundaryRows(
  previous: WorkspaceMessengerReadBoundaryCacheRow | undefined,
  candidate: WorkspaceMessengerReadBoundaryCacheRow,
): WorkspaceMessengerReadBoundaryCacheRow {
  if (previous == null) return candidate;
  const order = compareReadBoundaryOrder(previous, candidate);
  if (order > 0) return previous;
  if (order < 0) return candidate;

  const epochVersion = Math.max(previous.epochVersion ?? -1, candidate.epochVersion ?? -1);
  return epochVersion < 0
    ? { ...previous, epochVersion: undefined }
    : { ...previous, epochVersion };
}

export async function advanceMessengerReadBoundaryCache(
  boundary: Omit<WorkspaceMessengerReadBoundaryCacheRow, "id">,
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = await openWorkspaceMessengerCacheDb();
    const stores = WORKSPACE_MESSENGER_CACHE_STORES;
    const transaction = db.transaction(
      [stores.readBoundaries, stores.messages, stores.messageBuckets],
      "readwrite",
    );
    const boundaryStore = transaction.objectStore(stores.readBoundaries);
    const id = readBoundaryRowId(boundary.ownerKey, boundary.streamUuid, boundary.topicUuid);
    const previous = await requestToPromise<WorkspaceMessengerReadBoundaryCacheRow | undefined>(
      boundaryStore.get(id),
    );
    const effective = mergeReadBoundaryRows(previous, { ...boundary, id });
    boundaryStore.put(effective);

    const conversationId = topicConversationId(effective.streamUuid, effective.topicUuid);
    const orderKey = workspaceMessengerMessageOrderKey({
      createdAt: effective.createdAt,
      uuid: effective.messageUuid,
    });
    const bucketRows = await requestToPromise<WorkspaceMessengerMessageBucketRow[]>(
      transaction
        .objectStore(stores.messageBuckets)
        .index("byConversationOrder")
        .getAll(
          IDBKeyRange.bound(
            [effective.ownerKey, conversationId, ""],
            [effective.ownerKey, conversationId, orderKey],
          ),
        ),
    );
    const messageStore = transaction.objectStore(stores.messages);
    const rows = await Promise.all(
      bucketRows.map((bucket) =>
        requestToPromise<WorkspaceMessengerMessageCacheRow | undefined>(
          messageStore.get(cacheRowId(effective.ownerKey, bucket.messageUuid)),
        ),
      ),
    );
    for (const row of rows) {
      if (row?.ownerKey !== effective.ownerKey || row.message.read === true) continue;
      messageStore.put({
        ...row,
        message: { ...row.message, read: true },
        version: row.version + 1,
      } satisfies WorkspaceMessengerMessageCacheRow);
    }

    await transactionDone(transaction);
  } catch (error) {
    logCacheWriteFailure("advance-read-boundary", error);
  }
}

export async function deleteCachedMessage(
  ownerKey: string,
  messageUuid: string,
  conversationIds: readonly string[],
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = await openWorkspaceMessengerCacheDb();
    const existingBuckets = await readMessageBucketsByMessage(db, ownerKey, messageUuid);
    const targetConversationIds =
      conversationIds.length > 0
        ? new Set(conversationIds)
        : new Set(existingBuckets.map((bucket) => bucket.conversationId));
    const bucketsToDelete = existingBuckets.filter((bucket) =>
      targetConversationIds.has(bucket.conversationId),
    );
    const shouldDeleteBody = bucketsToDelete.length === existingBuckets.length;
    const stores = WORKSPACE_MESSENGER_CACHE_STORES;
    const transaction = db.transaction([stores.messages, stores.messageBuckets], "readwrite");
    const bucketStore = transaction.objectStore(stores.messageBuckets);

    for (const bucket of bucketsToDelete) {
      bucketStore.delete(bucket.id);
    }
    if (shouldDeleteBody) {
      transaction.objectStore(stores.messages).delete(cacheRowId(ownerKey, messageUuid));
    }

    await transactionDone(transaction);
    if (shouldDeleteBody) {
      await deleteOwnMessageReactionsForMessage(ownerKey, messageUuid);
    }
  } catch {
    return;
  }
}

export async function writeRealtimeCursor(ownerKey: string, epochVersion: number): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = await openWorkspaceMessengerCacheDb();
    const transaction = db.transaction(
      WORKSPACE_MESSENGER_CACHE_STORES.realtimeCursor,
      "readwrite",
    );
    transaction.objectStore(WORKSPACE_MESSENGER_CACHE_STORES.realtimeCursor).put({
      ownerKey,
      epochVersion,
      updatedAt: Date.now(),
    } satisfies WorkspaceMessengerRealtimeCursorRow);
    await transactionDone(transaction);
  } catch {
    return;
  }
}

export async function readWorkspaceComposerDraft<TContent>(
  ownerKey: string,
  conversationId: string,
): Promise<WorkspaceMessengerComposerDraftCacheRow<TContent> | null> {
  if (!isIndexedDBAvailable()) return null;

  try {
    const db = await openWorkspaceMessengerCacheDb();
    const transaction = db.transaction(WORKSPACE_MESSENGER_CACHE_STORES.composerDrafts, "readonly");
    const request = transaction
      .objectStore(WORKSPACE_MESSENGER_CACHE_STORES.composerDrafts)
      .get(composerDraftId(ownerKey, conversationId));
    return (
      ((await requestToPromise(request)) as
        | WorkspaceMessengerComposerDraftCacheRow<TContent>
        | undefined) ?? null
    );
  } catch {
    return null;
  }
}

export async function readWorkspaceComposerDraftRecords<TContent>(
  ownerKey: string,
): Promise<WorkspaceMessengerComposerDraftRecordCacheRow<TContent>[]> {
  if (!isIndexedDBAvailable()) return [];

  try {
    const db = await openWorkspaceMessengerCacheDb();
    const transaction = db.transaction(WORKSPACE_MESSENGER_CACHE_STORES.composerDrafts, "readonly");
    const store = transaction.objectStore(WORKSPACE_MESSENGER_CACHE_STORES.composerDrafts);
    const rows = store.indexNames.contains("byOwner")
      ? await requestToPromise(store.index("byOwner").getAll(ownerKey))
      : await requestToPromise(store.getAll());
    return (rows as WorkspaceMessengerComposerDraftRecordCacheRow<TContent>[])
      .filter((row) => row.ownerKey === ownerKey && typeof row.draftUuid === "string")
      .map((row) => ({
        ...row,
        disposition: normalizeComposerDraftDisposition(row.disposition, row.syncStatus),
      }));
  } catch {
    return [];
  }
}

export async function writeWorkspaceComposerDraftRecord<TContent>(
  ownerKey: string,
  draft: WorkspaceMessengerComposerDraftRecordCacheWrite<TContent>,
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = await openWorkspaceMessengerCacheDb();
    const transaction = db.transaction(
      WORKSPACE_MESSENGER_CACHE_STORES.composerDrafts,
      "readwrite",
    );
    transaction.objectStore(WORKSPACE_MESSENGER_CACHE_STORES.composerDrafts).put({
      id: composerDraftRecordId(ownerKey, draft.draftUuid),
      ownerKey,
      ...draft,
    } satisfies WorkspaceMessengerComposerDraftRecordCacheRow<TContent>);
    await transactionDone(transaction);
  } catch {
    return;
  }
}

/**
 * Moves a pre-v6 single-conversation draft into the record format without
 * leaving a legacy row that could be restored after the new record is deleted.
 */
export async function migrateWorkspaceComposerDraftToRecord<TContent>(
  ownerKey: string,
  conversationId: string,
  draft: WorkspaceMessengerComposerDraftRecordCacheWrite<TContent>,
): Promise<boolean> {
  if (!isIndexedDBAvailable()) return false;

  try {
    const db = await openWorkspaceMessengerCacheDb();
    const transaction = db.transaction(
      WORKSPACE_MESSENGER_CACHE_STORES.composerDrafts,
      "readwrite",
    );
    const store = transaction.objectStore(WORKSPACE_MESSENGER_CACHE_STORES.composerDrafts);
    store.put({
      id: composerDraftRecordId(ownerKey, draft.draftUuid),
      ownerKey,
      ...draft,
    } satisfies WorkspaceMessengerComposerDraftRecordCacheRow<TContent>);
    store.delete(composerDraftId(ownerKey, conversationId));
    await transactionDone(transaction);
    return true;
  } catch {
    return false;
  }
}

export async function deleteWorkspaceComposerDraftRecord(
  ownerKey: string,
  draftUuid: string,
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = await openWorkspaceMessengerCacheDb();
    const transaction = db.transaction(
      WORKSPACE_MESSENGER_CACHE_STORES.composerDrafts,
      "readwrite",
    );
    transaction
      .objectStore(WORKSPACE_MESSENGER_CACHE_STORES.composerDrafts)
      .delete(composerDraftRecordId(ownerKey, draftUuid));
    await transactionDone(transaction);
  } catch {
    return;
  }
}

export async function deleteWorkspaceComposerDraftRecordsForStream(
  ownerKey: string,
  streamUuid: string,
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = await openWorkspaceMessengerCacheDb();
    const readTransaction = db.transaction(
      WORKSPACE_MESSENGER_CACHE_STORES.composerDrafts,
      "readonly",
    );
    const readStore = readTransaction.objectStore(WORKSPACE_MESSENGER_CACHE_STORES.composerDrafts);
    const rows = readStore.indexNames.contains("byOwner")
      ? await requestToPromise(readStore.index("byOwner").getAll(ownerKey))
      : await requestToPromise(readStore.getAll());
    const matchingRows = (
      rows as {
        id: string;
        ownerKey: string;
        conversationId?: string;
        streamUuid?: string;
      }[]
    ).filter(
      (row) =>
        row.ownerKey === ownerKey &&
        (row.streamUuid === streamUuid ||
          row.conversationId === `stream:${streamUuid}` ||
          row.conversationId?.startsWith(`topic:${streamUuid}:`) === true),
    );
    if (matchingRows.length === 0) return;
    const transaction = db.transaction(
      WORKSPACE_MESSENGER_CACHE_STORES.composerDrafts,
      "readwrite",
    );
    const store = transaction.objectStore(WORKSPACE_MESSENGER_CACHE_STORES.composerDrafts);
    for (const row of matchingRows) {
      store.delete(row.id);
    }
    await transactionDone(transaction);
  } catch {
    return;
  }
}

export async function writeMessengerSearchResults(
  ownerKey: string,
  result: WorkspaceMessengerSearchResultWrite,
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = await openWorkspaceMessengerCacheDb();
    const transaction = db.transaction(WORKSPACE_MESSENGER_CACHE_STORES.searchResults, "readwrite");
    transaction.objectStore(WORKSPACE_MESSENGER_CACHE_STORES.searchResults).put({
      id: cacheRowId(ownerKey, result.queryHash),
      ownerKey,
      queryHash: result.queryHash,
      query: result.query,
      filters: result.filters,
      resultMessageUuids: [...result.resultMessageUuids],
      createdAt: result.createdAt ?? Date.now(),
      expiresAt: result.expiresAt,
    } satisfies WorkspaceMessengerSearchResultRow);
    await transactionDone(transaction);
  } catch {
    return;
  }
}

export async function readMessengerSearchResults(
  ownerKey: string,
  queryHash: string,
  now = Date.now(),
): Promise<WorkspaceMessengerSearchResultRow | null> {
  if (!isIndexedDBAvailable()) return null;

  try {
    const db = await openWorkspaceMessengerCacheDb();
    const transaction = db.transaction(WORKSPACE_MESSENGER_CACHE_STORES.searchResults, "readonly");
    const request = transaction
      .objectStore(WORKSPACE_MESSENGER_CACHE_STORES.searchResults)
      .get(cacheRowId(ownerKey, queryHash));
    const row = (await requestToPromise(request)) as WorkspaceMessengerSearchResultRow | undefined;
    if (row == null || row.expiresAt <= now) {
      return null;
    }
    return row;
  } catch {
    return null;
  }
}

export async function deleteExpiredMessengerSearchResults(
  ownerKey: string,
  now = Date.now(),
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = await openWorkspaceMessengerCacheDb();
    const transaction = db.transaction(WORKSPACE_MESSENGER_CACHE_STORES.searchResults, "readwrite");
    const store = transaction.objectStore(WORKSPACE_MESSENGER_CACHE_STORES.searchResults);
    const index = store.index("byOwnerExpiresAt");
    const request = index.openCursor(IDBKeyRange.bound([ownerKey, 0], [ownerKey, now]));
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor == null) return;
      cursor.delete();
      cursor.continue();
    };
    await transactionDone(transaction);
  } catch {
    return;
  }
}

export async function deleteMessengerSearchResultsForOwner(ownerKey: string): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = await openWorkspaceMessengerCacheDb();
    const storeName = WORKSPACE_MESSENGER_CACHE_STORES.searchResults;
    const rowIds = await readRowIdsByOwner(db, ownerKey, storeName);
    if (rowIds.length === 0) return;
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    for (const rowId of rowIds) {
      store.delete(rowId);
    }
    await transactionDone(transaction);
  } catch {
    return;
  }
}

export async function applyConversationMessageRetention(
  ownerKey: string,
  conversationId: string,
  maxMessages: number,
): Promise<void> {
  if (!isIndexedDBAvailable() || maxMessages < 1) return;

  try {
    const db = await openWorkspaceMessengerCacheDb();
    const buckets = await readConversationBuckets(db, ownerKey, conversationId);
    if (buckets.length <= maxMessages) return;

    const bucketsToDelete = buckets.slice(0, buckets.length - maxMessages);
    const allBucketsByMessage = new Map<string, WorkspaceMessengerMessageBucketRow[]>();
    await Promise.all(
      bucketsToDelete.map(async (bucket) => {
        allBucketsByMessage.set(
          bucket.messageUuid,
          await readMessageBucketsByMessage(db, ownerKey, bucket.messageUuid),
        );
      }),
    );

    const stores = WORKSPACE_MESSENGER_CACHE_STORES;
    const transaction = db.transaction(
      [stores.messages, stores.messageBuckets, stores.messageWindows],
      "readwrite",
    );
    const bucketStore = transaction.objectStore(stores.messageBuckets);
    const messageStore = transaction.objectStore(stores.messages);

    for (const bucket of bucketsToDelete) {
      bucketStore.delete(bucket.id);
      const messageBuckets = allBucketsByMessage.get(bucket.messageUuid) ?? [];
      if (messageBuckets.length === 1 && messageBuckets[0]?.id === bucket.id) {
        messageStore.delete(cacheRowId(ownerKey, bucket.messageUuid));
      }
    }

    const remainingBuckets = buckets.slice(buckets.length - maxMessages);
    transaction.objectStore(stores.messageWindows).put({
      id: cacheRowId(ownerKey, conversationId),
      ownerKey,
      conversationId,
      oldestMessageUuid: remainingBuckets[0]?.messageUuid ?? null,
      newestMessageUuid: remainingBuckets[remainingBuckets.length - 1]?.messageUuid ?? null,
      nextPageMarker: null,
      hasMore: true,
      reachedOldest: false,
      reachedNewest: true,
      hasGaps: true,
      windowSize: remainingBuckets.length,
      lastSyncedAt: Date.now(),
    } satisfies WorkspaceMessengerMessageWindowRow);
    await transactionDone(transaction);
  } catch {
    return;
  }
}
