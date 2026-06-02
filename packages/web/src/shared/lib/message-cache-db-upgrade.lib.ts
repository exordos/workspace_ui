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

export function createMessageCacheDbSchema(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
    const store = db.createObjectStore(STORE_MESSAGES, { keyPath: "id" });
    store.createIndex("byChatOrder", ["instanceChatKey", "messageId"], { unique: true });
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
  if (db.objectStoreNames.contains(STORE_AVATAR_BLOBS)) return;
  const avatarStore = db.createObjectStore(STORE_AVATAR_BLOBS, { keyPath: "id" });
  avatarStore.createIndex("byInstanceLastAccessed", ["instanceId", "lastAccessedAt"], {
    unique: false,
  });
}

/** Ensures the latest schema exists during `openMessageCacheDb` upgrade. */
export function runMessageCacheDbUpgrade(db: IDBDatabase): void {
  createMessageCacheDbSchema(db);
}
