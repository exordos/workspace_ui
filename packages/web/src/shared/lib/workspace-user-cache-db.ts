const DB_NAME = "workspace-user-cache-v1";
const DB_VERSION = 2;
const STORE_USERS = "users";
const STORE_SNAPSHOTS = "snapshots";
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

// A snapshot marker distinguishes a full users response from individual cached profiles.
export interface WorkspaceUserCacheSnapshot {
  profiles: WorkspaceUserCacheProfile[];
  complete: boolean;
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

function isNewerCacheProfile(
  current: WorkspaceUserCacheProfile,
  incoming: WorkspaceUserCacheProfile,
): boolean {
  return Date.parse(current.updatedAt) > Date.parse(incoming.updatedAt);
}

export function openWorkspaceUserCacheDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("indexedDB is not available"));
  }
  if (dbPromise != null) return dbPromise;

  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(idbError(request.error));
    request.onblocked = () => {
      blocked = true;
      reject(new Error("Workspace users cache upgrade is blocked"));
    };
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_USERS)) {
        const store = db.createObjectStore(STORE_USERS, { keyPath: "id" });
        store.createIndex(INDEX_BY_OWNER, "ownerKey", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
        db.createObjectStore(STORE_SNAPSHOTS);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) {
        db.close();
        return;
      }
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
  });

  dbPromise = opening;
  void opening.catch(() => {
    if (dbPromise === opening) dbPromise = null;
  });
  return opening;
}

async function withUsersStore(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore, tx: IDBTransaction) => void,
  includeSnapshots = false,
): Promise<void> {
  const db = await openWorkspaceUserCacheDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(
      includeSnapshots ? [STORE_USERS, STORE_SNAPSHOTS] : STORE_USERS,
      mode,
    );
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
  isWriteCurrent?: () => boolean,
  beforeDelete?: (row: WorkspaceUserCacheRow) => void,
): void {
  const request = store.index(INDEX_BY_OWNER).openCursor(IDBKeyRange.only(ownerKey));
  request.onsuccess = () => {
    if (isWriteCurrent?.() === false) {
      store.transaction.abort();
      return;
    }
    const cursor = request.result;
    if (cursor == null) {
      onDeleted?.();
      return;
    }
    beforeDelete?.(cursor.value as WorkspaceUserCacheRow);
    cursor.delete();
    cursor.continue();
  };
}

// Read the completion marker and data in one transaction.
export async function readWorkspaceUserCacheSnapshot(
  ownerKey: string,
): Promise<WorkspaceUserCacheSnapshot> {
  try {
    const db = await openWorkspaceUserCacheDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_USERS, STORE_SNAPSHOTS], "readonly");
      const rows = tx.objectStore(STORE_USERS).index(INDEX_BY_OWNER).getAll(ownerKey);
      const marker = tx.objectStore(STORE_SNAPSHOTS).get(ownerKey);
      tx.oncomplete = () =>
        resolve({
          profiles: (rows.result as WorkspaceUserCacheRow[]).map((row) => row.user),
          complete: marker.result === true,
        });
      tx.onabort = () => reject(idbError(tx.error));
    });
  } catch {
    return { profiles: [], complete: false };
  }
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
  options: {
    complete?: boolean;
    isWriteCurrent?: () => boolean;
    requireWrite?: boolean;
    reset?: boolean; // A fresh epoch can supersede the entire previous snapshot.
  } = {},
): Promise<void> {
  if (typeof indexedDB === "undefined") {
    if (options.requireWrite) throw new Error("Workspace users cache is unavailable");
    return;
  }
  try {
    await withUsersStore(
      "readwrite",
      (store, tx) => {
        if (options.isWriteCurrent?.() === false) return;
        const snapshotProfiles = new Map(users.map((user) => [user.uuid, user]));
        deleteOwnerRowsInStore(
          store,
          ownerKey,
          () => {
            const cacheUpdatedAt = Date.now();
            for (const user of snapshotProfiles.values()) {
              store.put(toCacheRow(ownerKey, user, cacheUpdatedAt));
            }
            if (options.complete === true) tx.objectStore(STORE_SNAPSHOTS).put(true, ownerKey);
          },
          options.isWriteCurrent,
          options.reset
            ? undefined
            : ({ user }) => {
                const incoming = snapshotProfiles.get(user.uuid);
                if (incoming != null && isNewerCacheProfile(user, incoming)) {
                  snapshotProfiles.set(user.uuid, user);
                }
              },
        );
      },
      options.complete === true,
    );
  } catch (error) {
    if (options.requireWrite) throw error;
  }
}

export async function upsertWorkspaceUserCache(
  ownerKey: string,
  users: readonly WorkspaceUserCacheProfile[],
  isWriteCurrent?: () => boolean,
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    await withUsersStore("readwrite", (store) => {
      if (isWriteCurrent?.() === false) return;
      const cacheUpdatedAt = Date.now();
      for (const user of users) {
        const request = store.get(rowId(ownerKey, user.uuid));
        request.onsuccess = () => {
          if (isWriteCurrent?.() === false) {
            store.transaction.abort();
            return;
          }
          const current = request.result as WorkspaceUserCacheRow | undefined;
          if (current == null || !isNewerCacheProfile(current.user, user)) {
            store.put(toCacheRow(ownerKey, user, cacheUpdatedAt));
          }
        };
      }
    });
  } catch {
    // best-effort
  }
}

export async function deleteWorkspaceUserOwnerCache(
  ownerKey: string,
  isWriteCurrent?: () => boolean,
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    await withUsersStore(
      "readwrite",
      (store, tx) => {
        if (isWriteCurrent?.() === false) return;
        deleteOwnerRowsInStore(store, ownerKey, undefined, isWriteCurrent);
        tx.objectStore(STORE_SNAPSHOTS).delete(ownerKey);
      },
      true,
    );
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
