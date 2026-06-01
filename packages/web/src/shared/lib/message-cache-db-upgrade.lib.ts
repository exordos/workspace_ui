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

function upgradeMessageCacheV1(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
    const store = db.createObjectStore(STORE_MESSAGES, { keyPath: "id" });
    store.createIndex("byChatOrder", ["instanceChatKey", "messageId"], { unique: true });
  }
  if (!db.objectStoreNames.contains(STORE_CHAT_META)) {
    db.createObjectStore(STORE_CHAT_META, { keyPath: "instanceChatKey" });
  }
}

function upgradeMessageCacheV2(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(STORE_CHAT_LIST_SNAPSHOT)) {
    db.createObjectStore(STORE_CHAT_LIST_SNAPSHOT, { keyPath: "instanceId" });
  }
}

function upgradeMessageCacheV3(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(STORE_USERS_DIRECTORY)) {
    db.createObjectStore(STORE_USERS_DIRECTORY, { keyPath: "instanceId" });
  }
}

function upgradeMessageCacheV4(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(STORE_USER_STATUS_CACHE)) {
    db.createObjectStore(STORE_USER_STATUS_CACHE, { keyPath: "id" });
  }
}

function upgradeMessageCacheV5(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(STORE_FOLDERS_SNAPSHOT)) {
    db.createObjectStore(STORE_FOLDERS_SNAPSHOT, { keyPath: "instanceId" });
  }
}

function upgradeMessageCacheV6(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(STORE_MUTE_SNAPSHOT)) {
    db.createObjectStore(STORE_MUTE_SNAPSHOT, { keyPath: "instanceId" });
  }
}

function clearLegacyMessageStoresOnV7(db: IDBDatabase, tx: IDBTransaction | null): void {
  if (tx == null) return;
  if (db.objectStoreNames.contains(STORE_MESSAGES)) {
    tx.objectStore(STORE_MESSAGES).clear();
  }
  if (db.objectStoreNames.contains(STORE_CHAT_META)) {
    tx.objectStore(STORE_CHAT_META).clear();
  }
  if (db.objectStoreNames.contains(STORE_CHAT_LIST_SNAPSHOT)) {
    tx.objectStore(STORE_CHAT_LIST_SNAPSHOT).clear();
  }
}

function upgradeMessageCacheV8(db: IDBDatabase): void {
  if (db.objectStoreNames.contains(STORE_AVATAR_BLOBS)) return;
  const avatarStore = db.createObjectStore(STORE_AVATAR_BLOBS, { keyPath: "id" });
  avatarStore.createIndex("byInstanceLastAccessed", ["instanceId", "lastAccessedAt"], {
    unique: false,
  });
}

/** Applies versioned object-store migrations during `openMessageCacheDb` upgrade. */
export function runMessageCacheDbUpgrade(
  db: IDBDatabase,
  oldVersion: number,
  upgradeTransaction: IDBTransaction | null,
): void {
  if (oldVersion < 1) {
    upgradeMessageCacheV1(db);
  }
  if (oldVersion < 2) {
    upgradeMessageCacheV2(db);
  }
  if (oldVersion < 3) {
    upgradeMessageCacheV3(db);
  }
  if (oldVersion < 4) {
    upgradeMessageCacheV4(db);
  }
  if (oldVersion < 5) {
    upgradeMessageCacheV5(db);
  }
  if (oldVersion < 6) {
    upgradeMessageCacheV6(db);
  }
  if (oldVersion < 7) {
    clearLegacyMessageStoresOnV7(db, upgradeTransaction);
  }
  if (oldVersion < 8) {
    upgradeMessageCacheV8(db);
  }
}
