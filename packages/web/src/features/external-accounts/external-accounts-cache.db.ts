/** Credential-free IndexedDB snapshot for cache-first external account settings. */
import { resolveCurrentMessengerCacheAccountScope } from "~/shared/lib/messenger-cache-scope.lib";
import type {
  ExternalChat,
  ExternalOperation,
  ZulipExternalAccount,
} from "./external-accounts.types";

const DB_NAME = "workspace-external-accounts-cache";
const DB_VERSION = 1;
const STORE_SNAPSHOTS = "snapshots";

function idbError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error("External account IndexedDB error");
}

export interface ExternalAccountsSnapshot {
  cacheKey: string;
  version: 1;
  savedAt: number;
  account: ZulipExternalAccount | null;
  chats: ExternalChat[];
  operations: ExternalOperation[];
}

function currentCacheKey(): string | null {
  const scope = resolveCurrentMessengerCacheAccountScope();
  return scope == null ? null : `${scope.accountScope}|external-accounts`;
}

function openExternalAccountsCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () =>
      reject(request.error ?? new Error("External account cache open failed"));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
        db.createObjectStore(STORE_SNAPSHOTS, { keyPath: "cacheKey" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

export async function loadCurrentExternalAccountsSnapshot(): Promise<ExternalAccountsSnapshot | null> {
  const cacheKey = currentCacheKey();
  if (cacheKey == null || typeof indexedDB === "undefined") return null;
  try {
    const db = await openExternalAccountsCacheDb();
    return await new Promise((resolve, reject) => {
      const request = db
        .transaction(STORE_SNAPSHOTS, "readonly")
        .objectStore(STORE_SNAPSHOTS)
        .get(cacheKey);
      request.onerror = () => reject(idbError(request.error));
      request.onsuccess = () => {
        const snapshot = request.result as ExternalAccountsSnapshot | undefined;
        resolve(snapshot?.version === 1 ? snapshot : null);
      };
    });
  } catch {
    return null;
  }
}

export async function persistCurrentExternalAccountsSnapshot(
  snapshot: Omit<ExternalAccountsSnapshot, "cacheKey" | "version" | "savedAt">,
): Promise<void> {
  const cacheKey = currentCacheKey();
  if (cacheKey == null || typeof indexedDB === "undefined") return;
  try {
    const db = await openExternalAccountsCacheDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_SNAPSHOTS, "readwrite");
      transaction.onerror = () => reject(idbError(transaction.error));
      transaction.oncomplete = () => resolve();
      transaction.objectStore(STORE_SNAPSHOTS).put({
        ...snapshot,
        cacheKey,
        version: 1,
        savedAt: Date.now(),
      } satisfies ExternalAccountsSnapshot);
    });
  } catch {
    // Best-effort persistence must never block the settings surface.
  }
}

export async function deleteCurrentExternalAccountsSnapshot(): Promise<void> {
  const cacheKey = currentCacheKey();
  if (cacheKey == null || typeof indexedDB === "undefined") return;
  try {
    const db = await openExternalAccountsCacheDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_SNAPSHOTS, "readwrite");
      transaction.onerror = () => reject(idbError(transaction.error));
      transaction.oncomplete = () => resolve();
      transaction.objectStore(STORE_SNAPSHOTS).delete(cacheKey);
    });
  } catch {
    // Best-effort invalidation.
  }
}
