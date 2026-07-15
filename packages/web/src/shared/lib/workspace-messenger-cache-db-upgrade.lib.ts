/**
 * IndexedDB schema for the Workspace-native messenger cache.
 */
export const WORKSPACE_MESSENGER_CACHE_STORES = {
  ownerMeta: "ownerMeta",
  streams: "streams",
  topics: "topics",
  conversations: "conversations",
  folders: "folders",
  folderItems: "folderItems",
  users: "users",
  streamBindings: "streamBindings",
  messages: "messages",
  messageBuckets: "messageBuckets",
  messageWindows: "messageWindows",
  // Отдельный store нужен только для собственных reactionUuid текущего пользователя.
  ownMessageReactions: "ownMessageReactions",
  realtimeCursor: "realtimeCursor",
  searchResults: "searchResults",
  composerDrafts: "composerDrafts",
} as const;

function createOwnerIndex(store: IDBObjectStore): void {
  store.createIndex("byOwner", "ownerKey", { unique: false });
}

export function createWorkspaceMessengerCacheDbSchema(db: IDBDatabase): void {
  const stores = WORKSPACE_MESSENGER_CACHE_STORES;

  if (!db.objectStoreNames.contains(stores.ownerMeta)) {
    db.createObjectStore(stores.ownerMeta, { keyPath: "ownerKey" });
  }

  if (!db.objectStoreNames.contains(stores.streams)) {
    const store = db.createObjectStore(stores.streams, { keyPath: "id" });
    createOwnerIndex(store);
    store.createIndex("byOwnerUpdatedAt", ["ownerKey", "updatedAt"], { unique: false });
  }

  if (!db.objectStoreNames.contains(stores.topics)) {
    const store = db.createObjectStore(stores.topics, { keyPath: "id" });
    createOwnerIndex(store);
    store.createIndex("byOwnerStream", ["ownerKey", "streamUuid"], { unique: false });
  }

  if (!db.objectStoreNames.contains(stores.conversations)) {
    const store = db.createObjectStore(stores.conversations, { keyPath: "id" });
    createOwnerIndex(store);
    store.createIndex("byOwnerUpdatedAt", ["ownerKey", "updatedAt"], { unique: false });
  }

  if (!db.objectStoreNames.contains(stores.folders)) {
    const store = db.createObjectStore(stores.folders, { keyPath: "id" });
    createOwnerIndex(store);
    store.createIndex("byOwnerUpdatedAt", ["ownerKey", "updatedAt"], { unique: false });
  }

  if (!db.objectStoreNames.contains(stores.folderItems)) {
    const store = db.createObjectStore(stores.folderItems, { keyPath: "id" });
    createOwnerIndex(store);
    store.createIndex("byOwnerFolder", ["ownerKey", "folderUuid"], { unique: false });
  }

  if (!db.objectStoreNames.contains(stores.users)) {
    const store = db.createObjectStore(stores.users, { keyPath: "id" });
    createOwnerIndex(store);
    store.createIndex("byOwnerUpdatedAt", ["ownerKey", "updatedAt"], { unique: false });
  }

  if (!db.objectStoreNames.contains(stores.streamBindings)) {
    const store = db.createObjectStore(stores.streamBindings, { keyPath: "id" });
    createOwnerIndex(store);
    store.createIndex("byOwnerStream", ["ownerKey", "streamUuid"], { unique: false });
  }

  if (!db.objectStoreNames.contains(stores.messages)) {
    const store = db.createObjectStore(stores.messages, { keyPath: "id" });
    createOwnerIndex(store);
    store.createIndex("byOwnerCreatedAt", ["ownerKey", "createdAt"], { unique: false });
  }

  if (!db.objectStoreNames.contains(stores.messageBuckets)) {
    const store = db.createObjectStore(stores.messageBuckets, { keyPath: "id" });
    createOwnerIndex(store);
    store.createIndex("byConversationOrder", ["ownerKey", "conversationId", "orderKey"], {
      unique: true,
    });
    store.createIndex("byMessage", ["ownerKey", "messageUuid"], { unique: false });
  }

  if (!db.objectStoreNames.contains(stores.messageWindows)) {
    const store = db.createObjectStore(stores.messageWindows, { keyPath: "id" });
    createOwnerIndex(store);
  }

  // Таблица хранит только реакции текущего пользователя. Индекс по сообщению
  // нужен для гидрации видимого окна и точечного reconcile, а индекс по
  // reactionUuid оставлен для будущих cleanup/lookup сценариев без full scan.
  if (!db.objectStoreNames.contains(stores.ownMessageReactions)) {
    const store = db.createObjectStore(stores.ownMessageReactions, { keyPath: "id" });
    createOwnerIndex(store);
    store.createIndex("byOwnerMessage", ["ownerKey", "messageUuid"], { unique: false });
    store.createIndex("byOwnerReactionUuid", ["ownerKey", "reactionUuid"], { unique: false });
  }

  if (!db.objectStoreNames.contains(stores.realtimeCursor)) {
    db.createObjectStore(stores.realtimeCursor, { keyPath: "ownerKey" });
  }

  if (!db.objectStoreNames.contains(stores.searchResults)) {
    const store = db.createObjectStore(stores.searchResults, { keyPath: "id" });
    createOwnerIndex(store);
    store.createIndex("byOwnerExpiresAt", ["ownerKey", "expiresAt"], { unique: false });
  }

  if (!db.objectStoreNames.contains(stores.composerDrafts)) {
    const store = db.createObjectStore(stores.composerDrafts, { keyPath: "id" });
    createOwnerIndex(store);
  }
}

/** Ensures the latest Workspace messenger cache schema exists during open. */
export function runWorkspaceMessengerCacheDbUpgrade(db: IDBDatabase): void {
  createWorkspaceMessengerCacheDbSchema(db);
}
