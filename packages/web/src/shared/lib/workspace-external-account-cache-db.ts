const DB_NAME = "workspace-external-account-cache-v1";
const DB_VERSION = 1;
const STORE_ACCOUNTS = "accounts";
const INDEX_BY_OWNER = "byOwner";
const ROW_ID_SEPARATOR = "\0";

export const WORKSPACE_EXTERNAL_ACCOUNT_CACHE_DB_NAME = DB_NAME;
export const WORKSPACE_EXTERNAL_ACCOUNT_CACHE_DB_VERSION = DB_VERSION;

export type WorkspaceExternalAccountCacheAccountType = "zulip" | "iam";
export type WorkspaceExternalAccountCacheStatus = "new" | "active";
export type WorkspaceExternalAccountCacheAccessStatus =
  | "missing_credentials"
  | "confirmed"
  | "invalid_credentials"
  | "unavailable";

export interface WorkspaceExternalAccountCacheUserInfo {
  userId: number | null;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
}

export interface WorkspaceExternalAccountCacheProfile {
  uuid: string;
  projectId: string;
  userUuid: string;
  serverUrl: string;
  sourceScope: string | null;
  accountType: WorkspaceExternalAccountCacheAccountType;
  status: WorkspaceExternalAccountCacheStatus;
  accessStatus: WorkspaceExternalAccountCacheAccessStatus;
  accessCheckedAt: string | null;
  accessConfirmedAt: string | null;
  accessNextCheckAt: string;
  accessLastError: string | null;
  accountSettingsKind: WorkspaceExternalAccountCacheAccountType;
  userInfo: WorkspaceExternalAccountCacheUserInfo | null;
  createdAt: string;
  updatedAt: string;
}

interface WorkspaceExternalAccountCacheRow {
  id: string;
  ownerKey: string;
  accountUuid: string;
  account: WorkspaceExternalAccountCacheProfile;
  cacheUpdatedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function idbError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error("indexedDB error", { cause: reason });
}

function isIndexedDBAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

function rowId(ownerKey: string, accountUuid: string): string {
  return `${ownerKey}${ROW_ID_SEPARATOR}${accountUuid}`;
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

export function openWorkspaceExternalAccountCacheDb(): Promise<IDBDatabase> {
  if (!isIndexedDBAvailable()) {
    return Promise.reject(new Error("indexedDB is not available"));
  }
  if (dbPromise != null) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => {
      dbPromise = null;
      reject(idbError(request.error));
    };
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_ACCOUNTS)) {
        const store = db.createObjectStore(STORE_ACCOUNTS, { keyPath: "id" });
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

export async function readWorkspaceExternalAccountCache(
  ownerKey: string,
): Promise<WorkspaceExternalAccountCacheProfile[]> {
  if (!isIndexedDBAvailable()) return [];
  try {
    const db = await openWorkspaceExternalAccountCacheDb();
    const transaction = db.transaction(STORE_ACCOUNTS, "readonly");
    const rows = await requestToPromise(
      transaction.objectStore(STORE_ACCOUNTS).index(INDEX_BY_OWNER).getAll(ownerKey) as IDBRequest<
        WorkspaceExternalAccountCacheRow[]
      >,
    );
    return rows.map((row) => row.account);
  } catch {
    return [];
  }
}

export async function replaceWorkspaceExternalAccountCache(
  ownerKey: string,
  accounts: readonly WorkspaceExternalAccountCacheProfile[],
): Promise<void> {
  if (!isIndexedDBAvailable()) return;
  try {
    const db = await openWorkspaceExternalAccountCacheDb();
    const transaction = db.transaction(STORE_ACCOUNTS, "readwrite");
    const store = transaction.objectStore(STORE_ACCOUNTS);
    deleteOwnerRowsInStore(store, ownerKey, () => {
      const cacheUpdatedAt = Date.now();
      for (const account of accounts) {
        store.put({
          id: rowId(ownerKey, account.uuid),
          ownerKey,
          accountUuid: account.uuid,
          account,
          cacheUpdatedAt,
        } satisfies WorkspaceExternalAccountCacheRow);
      }
    });
    await transactionDone(transaction);
  } catch {
    // Cache persistence is best-effort.
  }
}

export async function deleteWorkspaceExternalAccountOwnerCache(ownerKey: string): Promise<void> {
  if (!isIndexedDBAvailable()) return;
  try {
    const db = await openWorkspaceExternalAccountCacheDb();
    const transaction = db.transaction(STORE_ACCOUNTS, "readwrite");
    deleteOwnerRowsInStore(transaction.objectStore(STORE_ACCOUNTS), ownerKey);
    await transactionDone(transaction);
  } catch {
    // Cache cleanup is best-effort.
  }
}

export function resetWorkspaceExternalAccountCacheDbSingletonForTests(): void {
  dbPromise = null;
}

export async function deleteWorkspaceExternalAccountCacheDatabase(): Promise<void> {
  if (!isIndexedDBAvailable()) return;
  dbPromise = null;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onerror = () => reject(idbError(request.error));
    request.onsuccess = () => resolve();
    request.onblocked = () => resolve();
  });
}
