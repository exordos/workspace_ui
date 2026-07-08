const DB_NAME = "workspace-user-cache-v1";
const DB_VERSION = 1;
const STORE_USERS = "users";
const INDEX_BY_OWNER = "byOwner";
const ROW_ID_SEPARATOR = "\0";

export const WORKSPACE_USER_CACHE_DB_NAME = DB_NAME;
export const WORKSPACE_USER_CACHE_DB_VERSION = DB_VERSION;

export interface WorkspaceUserCacheProfile {
  uuid: string;
  username: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceUserCacheRow {
  id: string;
  ownerKey: string;
  userUuid: string;
  user: WorkspaceUserCacheProfile;
  cacheUpdatedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function idbError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error("indexedDB error", { cause: reason });
}

function rowId(ownerKey: string, userUuid: string): string {
  return `${ownerKey}${ROW_ID_SEPARATOR}${userUuid}`;
}

function toCacheRow(
  ownerKey: string,
  user: WorkspaceUserCacheProfile,
  cacheUpdatedAt: number,
): WorkspaceUserCacheRow {
  return {
    id: rowId(ownerKey, user.uuid),
    ownerKey,
    userUuid: user.uuid,
    user,
    cacheUpdatedAt,
  };
}

export function openWorkspaceUserCacheDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("indexedDB is not available"));
  }
  if (dbPromise != null) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(idbError(request.error));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_USERS)) {
        const store = db.createObjectStore(STORE_USERS, { keyPath: "id" });
        store.createIndex(INDEX_BY_OWNER, "ownerKey", { unique: false });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
  });

  return dbPromise;
}

async function withUsersStore(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore, tx: IDBTransaction) => void,
): Promise<void> {
  const db = await openWorkspaceUserCacheDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_USERS, mode);
    tx.onerror = () => reject(idbError(tx.error));
    tx.onabort = () => reject(idbError(tx.error));
    tx.oncomplete = () => resolve();
    run(tx.objectStore(STORE_USERS), tx);
  });
}

async function readWorkspaceUserRows<TResult>(
  run: (store: IDBObjectStore, tx: IDBTransaction) => IDBRequest<TResult>,
): Promise<TResult> {
  const db = await openWorkspaceUserCacheDb();
  return await new Promise<TResult>((resolve, reject) => {
    const tx = db.transaction(STORE_USERS, "readonly");
    const store = tx.objectStore(STORE_USERS);
    tx.onerror = () => reject(idbError(tx.error));
    tx.onabort = () => reject(idbError(tx.error));
    const request = run(store, tx);
    request.onerror = () => reject(idbError(request.error));
    request.onsuccess = () => resolve(request.result);
  });
}

function deleteOwnerRowsInStore(
  store: IDBObjectStore,
  ownerKey: string,
  onDeleted?: () => void,
): void {
  const request = store.index(INDEX_BY_OWNER).openCursor(IDBKeyRange.only(ownerKey));
  request.onsuccess = () => {
    const cursor = request.result;
    if (cursor == null) {
      onDeleted?.();
      return;
    }
    cursor.delete();
    cursor.continue();
  };
}

export async function readWorkspaceUserCache(
  ownerKey: string,
): Promise<WorkspaceUserCacheProfile[]> {
  if (typeof indexedDB === "undefined") return [];
  try {
    const rows = await readWorkspaceUserRows((store) =>
      store.index(INDEX_BY_OWNER).getAll(ownerKey),
    );
    return ((rows as WorkspaceUserCacheRow[] | undefined) ?? []).map((row) => row.user);
  } catch {
    return [];
  }
}

export async function readWorkspaceUserCacheProfile(
  ownerKey: string,
  userUuid: string,
): Promise<WorkspaceUserCacheProfile | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const row = await readWorkspaceUserRows(
      (store) =>
        store.get(rowId(ownerKey, userUuid)) as IDBRequest<WorkspaceUserCacheRow | undefined>,
    );
    return row?.user ?? null;
  } catch {
    return null;
  }
}

export async function replaceWorkspaceUserCache(
  ownerKey: string,
  users: readonly WorkspaceUserCacheProfile[],
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    await withUsersStore("readwrite", (store) => {
      deleteOwnerRowsInStore(store, ownerKey, () => {
        const cacheUpdatedAt = Date.now();
        for (const user of users) {
          store.put(toCacheRow(ownerKey, user, cacheUpdatedAt));
        }
      });
    });
  } catch {
    // best-effort
  }
}

export async function upsertWorkspaceUserCache(
  ownerKey: string,
  users: readonly WorkspaceUserCacheProfile[],
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    await withUsersStore("readwrite", (store) => {
      const cacheUpdatedAt = Date.now();
      for (const user of users) {
        store.put(toCacheRow(ownerKey, user, cacheUpdatedAt));
      }
    });
  } catch {
    // best-effort
  }
}

export async function deleteWorkspaceUserOwnerCache(ownerKey: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    await withUsersStore("readwrite", (store) => {
      deleteOwnerRowsInStore(store, ownerKey);
    });
  } catch {
    // best-effort
  }
}

export function resetWorkspaceUserCacheDbSingletonForTests(): void {
  dbPromise = null;
}

export async function deleteWorkspaceUserCacheDatabase(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  dbPromise = null;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onerror = () => reject(idbError(request.error));
    request.onsuccess = () => resolve();
    request.onblocked = () => resolve();
  });
}
