/**
 * IndexedDB schema migrations for `message-cache-db.ts`.
 */
const STORE_MESSAGES = "messages";
const STORE_CHAT_META = "chatMeta";
const STORE_CHAT_LIST_SNAPSHOT = "chatListSnapshot";
const STORE_USERS_DIRECTORY = "usersDirectory";
const STORE_USER_STATUS_CACHE = "userStatusCache";
const STORE_FOLDERS_SNAPSHOT = "foldersSnapshot";
const STORE_MUTE_SNAPSHOT = "muteSnapshot";
const STORE_AVATAR_BLOBS = "avatarBlobs";
const STORE_MESSENGER_ENTITIES_SNAPSHOT = "messengerEntitiesSnapshot";
const STORE_WORKSPACE_FILE_BLOBS = "workspaceFileBlobs";
const STORE_WORKSPACE_FILE_METADATA = "workspaceFileMetadata";
const STORE_WORKSPACE_AVATAR_POINTERS = "workspaceAvatarPointers";

function ensureMessagesStore(db: IDBDatabase, transaction?: IDBTransaction | null): void {
  if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
    const store = db.createObjectStore(STORE_MESSAGES, { keyPath: "id" });
    store.createIndex("byChatOrder", ["instanceChatKey", "messageId"], { unique: true });
    store.createIndex("byChatTimeline", ["instanceChatKey", "timeline", "messageId"], {
      unique: true,
    });
    return;
  }
  const store = transaction?.objectStore(STORE_MESSAGES);
  if (store != null && !store.indexNames.contains("byChatTimeline")) {
    store.createIndex("byChatTimeline", ["instanceChatKey", "timeline", "messageId"], {
      unique: true,
    });
  }
}

function ensureSimpleStore(db: IDBDatabase, name: string, keyPath: string): void {
  if (!db.objectStoreNames.contains(name)) {
    db.createObjectStore(name, { keyPath });
  }
}

function ensureMessengerEntitiesSnapshotStore(
  db: IDBDatabase,
  transaction?: IDBTransaction | null,
): void {
  if (!db.objectStoreNames.contains(STORE_MESSENGER_ENTITIES_SNAPSHOT)) {
    const store = db.createObjectStore(STORE_MESSENGER_ENTITIES_SNAPSHOT, { keyPath: "cacheKey" });
    store.createIndex("byAccountScope", "accountScope", { unique: false });
    return;
  }
  const store = transaction?.objectStore(STORE_MESSENGER_ENTITIES_SNAPSHOT);
  if (store != null && store.keyPath !== "cacheKey") {
    db.deleteObjectStore(STORE_MESSENGER_ENTITIES_SNAPSHOT);
    const replacement = db.createObjectStore(STORE_MESSENGER_ENTITIES_SNAPSHOT, {
      keyPath: "cacheKey",
    });
    replacement.createIndex("byAccountScope", "accountScope", { unique: false });
    return;
  }
  if (store != null && !store.indexNames.contains("byAccountScope")) {
    store.createIndex("byAccountScope", "accountScope", { unique: false });
  }
}

function ensureWorkspaceFileBlobStore(db: IDBDatabase): void {
  if (db.objectStoreNames.contains(STORE_WORKSPACE_FILE_BLOBS)) return;
  const store = db.createObjectStore(STORE_WORKSPACE_FILE_BLOBS, { keyPath: "id" });
  store.createIndex("byPartition", "partition", { unique: false });
  store.createIndex("byPartitionFile", ["partition", "fileUuid"], { unique: false });
  store.createIndex("byPartitionStream", ["partition", "streamKey"], { unique: false });
  store.createIndex("byInstance", "instanceId", { unique: false });
}

function ensureWorkspaceFileMetadataStore(db: IDBDatabase): void {
  if (db.objectStoreNames.contains(STORE_WORKSPACE_FILE_METADATA)) return;
  const store = db.createObjectStore(STORE_WORKSPACE_FILE_METADATA, { keyPath: "id" });
  store.createIndex("byPartition", "partition", { unique: false });
  store.createIndex("byPartitionStream", ["partition", "streamKey"], { unique: false });
  store.createIndex("byInstance", "instanceId", { unique: false });
}

function ensureWorkspaceAvatarPointerStore(db: IDBDatabase): void {
  if (db.objectStoreNames.contains(STORE_WORKSPACE_AVATAR_POINTERS)) return;
  const store = db.createObjectStore(STORE_WORKSPACE_AVATAR_POINTERS, { keyPath: "id" });
  store.createIndex("byPartition", "partition", { unique: false });
  store.createIndex("byInstance", "instanceId", { unique: false });
}

function ensureAvatarBlobStore(db: IDBDatabase): void {
  if (db.objectStoreNames.contains(STORE_AVATAR_BLOBS)) return;
  const store = db.createObjectStore(STORE_AVATAR_BLOBS, { keyPath: "id" });
  store.createIndex("byInstanceLastAccessed", ["instanceId", "lastAccessedAt"], {
    unique: false,
  });
}

export function createMessageCacheDbSchema(
  db: IDBDatabase,
  transaction?: IDBTransaction | null,
): void {
  ensureMessagesStore(db, transaction);
  ensureSimpleStore(db, STORE_CHAT_META, "instanceChatKey");
  ensureSimpleStore(db, STORE_CHAT_LIST_SNAPSHOT, "instanceId");
  ensureSimpleStore(db, STORE_USERS_DIRECTORY, "instanceId");
  ensureSimpleStore(db, STORE_USER_STATUS_CACHE, "id");
  ensureSimpleStore(db, STORE_FOLDERS_SNAPSHOT, "instanceId");
  ensureSimpleStore(db, STORE_MUTE_SNAPSHOT, "instanceId");
  ensureMessengerEntitiesSnapshotStore(db, transaction);
  ensureWorkspaceFileBlobStore(db);
  ensureWorkspaceFileMetadataStore(db);
  ensureWorkspaceAvatarPointerStore(db);
  ensureAvatarBlobStore(db);
}

/** Ensures the latest schema exists during `openMessageCacheDb` upgrade. */
export function runMessageCacheDbUpgrade(
  db: IDBDatabase,
  transaction?: IDBTransaction | null,
): void {
  createMessageCacheDbSchema(db, transaction);
}
