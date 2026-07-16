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

export function createMessageCacheDbSchema(
  db: IDBDatabase,
  transaction?: IDBTransaction | null,
): void {
  if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
    const store = db.createObjectStore(STORE_MESSAGES, { keyPath: "id" });
    store.createIndex("byChatOrder", ["instanceChatKey", "messageId"], { unique: true });
    store.createIndex("byChatTimeline", ["instanceChatKey", "timeline", "messageId"], {
      unique: true,
    });
  } else {
    const store = transaction?.objectStore(STORE_MESSAGES);
    if (store != null && !store.indexNames.contains("byChatTimeline")) {
      store.createIndex("byChatTimeline", ["instanceChatKey", "timeline", "messageId"], {
        unique: true,
      });
    }
  }
  if (!db.objectStoreNames.contains(STORE_CHAT_META)) {
    db.createObjectStore(STORE_CHAT_META, { keyPath: "instanceChatKey" });
  }
  if (!db.objectStoreNames.contains(STORE_CHAT_LIST_SNAPSHOT)) {
    db.createObjectStore(STORE_CHAT_LIST_SNAPSHOT, { keyPath: "instanceId" });
  }
  if (!db.objectStoreNames.contains(STORE_USERS_DIRECTORY)) {
    db.createObjectStore(STORE_USERS_DIRECTORY, { keyPath: "instanceId" });
  }
  if (!db.objectStoreNames.contains(STORE_USER_STATUS_CACHE)) {
    db.createObjectStore(STORE_USER_STATUS_CACHE, { keyPath: "id" });
  }
  if (!db.objectStoreNames.contains(STORE_FOLDERS_SNAPSHOT)) {
    db.createObjectStore(STORE_FOLDERS_SNAPSHOT, { keyPath: "instanceId" });
  }
  if (!db.objectStoreNames.contains(STORE_MUTE_SNAPSHOT)) {
    db.createObjectStore(STORE_MUTE_SNAPSHOT, { keyPath: "instanceId" });
  }
  if (!db.objectStoreNames.contains(STORE_MESSENGER_ENTITIES_SNAPSHOT)) {
    const store = db.createObjectStore(STORE_MESSENGER_ENTITIES_SNAPSHOT, { keyPath: "cacheKey" });
    store.createIndex("byAccountScope", "accountScope", { unique: false });
  } else {
    const store = transaction?.objectStore(STORE_MESSENGER_ENTITIES_SNAPSHOT);
    if (store != null && store.keyPath !== "cacheKey") {
      db.deleteObjectStore(STORE_MESSENGER_ENTITIES_SNAPSHOT);
      const replacement = db.createObjectStore(STORE_MESSENGER_ENTITIES_SNAPSHOT, {
        keyPath: "cacheKey",
      });
      replacement.createIndex("byAccountScope", "accountScope", { unique: false });
    } else if (store != null && !store.indexNames.contains("byAccountScope")) {
      store.createIndex("byAccountScope", "accountScope", { unique: false });
    }
  }
  if (!db.objectStoreNames.contains(STORE_WORKSPACE_FILE_BLOBS)) {
    const store = db.createObjectStore(STORE_WORKSPACE_FILE_BLOBS, { keyPath: "id" });
    store.createIndex("byPartition", "partition", { unique: false });
    store.createIndex("byPartitionFile", ["partition", "fileUuid"], { unique: false });
    store.createIndex("byPartitionStream", ["partition", "streamKey"], { unique: false });
    store.createIndex("byInstance", "instanceId", { unique: false });
  }
  if (!db.objectStoreNames.contains(STORE_WORKSPACE_FILE_METADATA)) {
    const store = db.createObjectStore(STORE_WORKSPACE_FILE_METADATA, { keyPath: "id" });
    store.createIndex("byPartition", "partition", { unique: false });
    store.createIndex("byPartitionStream", ["partition", "streamKey"], { unique: false });
    store.createIndex("byInstance", "instanceId", { unique: false });
  }
  if (!db.objectStoreNames.contains(STORE_WORKSPACE_AVATAR_POINTERS)) {
    const store = db.createObjectStore(STORE_WORKSPACE_AVATAR_POINTERS, { keyPath: "id" });
    store.createIndex("byPartition", "partition", { unique: false });
    store.createIndex("byInstance", "instanceId", { unique: false });
  }
  if (db.objectStoreNames.contains(STORE_AVATAR_BLOBS)) return;
  const avatarStore = db.createObjectStore(STORE_AVATAR_BLOBS, { keyPath: "id" });
  avatarStore.createIndex("byInstanceLastAccessed", ["instanceId", "lastAccessedAt"], {
    unique: false,
  });
}

/** Ensures the latest schema exists during `openMessageCacheDb` upgrade. */
export function runMessageCacheDbUpgrade(
  db: IDBDatabase,
  transaction?: IDBTransaction | null,
): void {
  createMessageCacheDbSchema(db, transaction);
}
