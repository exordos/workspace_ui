/**
 * Generic snapshot row persistence in IndexedDB (one object store, keyPath `instanceId`).
 */
import { openMessageCacheDb } from "./idb-open.lib";

function idbError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error("indexedDB error", { cause: reason });
}

export async function putSnapshotRow<T extends { instanceId: string }>(
  storeName: string,
  row: T,
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openMessageCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.onerror = () => reject(idbError(tx.error));
      tx.oncomplete = () => resolve();
      tx.objectStore(storeName).put(row);
    });
  } catch {
    // best-effort
  }
}

export async function getSnapshotRow<T extends { instanceId: string }>(
  storeName: string,
  instanceId: string,
): Promise<T | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openMessageCacheDb();
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      tx.onerror = () => reject(idbError(tx.error));
      const req = tx.objectStore(storeName).get(instanceId);
      req.onsuccess = () => {
        const row = req.result as T | undefined;
        resolve(row ?? null);
      };
      req.onerror = () => reject(idbError(req.error));
    });
  } catch {
    return null;
  }
}
