/**
 * Persists folder rail list per Zulip instance in IndexedDB (hydrate + write-through).
 */
import type { WorkspaceFolderForRail } from "~/shared/api/workspace-client";
import { openMessageCacheDb } from "~/shared/lib/message-cache-db";

const STORE_FOLDERS_SNAPSHOT = "foldersSnapshot";

export type FoldersSnapshotRowVersion = 1;

export interface FoldersSnapshotRow {
  instanceId: string;
  version: FoldersSnapshotRowVersion;
  folders: WorkspaceFolderForRail[];
}

function idbError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error("indexedDB error", { cause: reason });
}

export async function persistFoldersSnapshotRow(row: FoldersSnapshotRow): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openMessageCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_FOLDERS_SNAPSHOT, "readwrite");
      tx.onerror = () => reject(idbError(tx.error));
      tx.oncomplete = () => resolve();
      tx.objectStore(STORE_FOLDERS_SNAPSHOT).put({
        instanceId: row.instanceId,
        version: 1,
        folders: row.folders,
      });
    });
  } catch {
    // best-effort
  }
}

export async function loadFoldersSnapshotRow(
  instanceId: string,
): Promise<FoldersSnapshotRow | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openMessageCacheDb();
    return await new Promise<FoldersSnapshotRow | null>((resolve, reject) => {
      const tx = db.transaction(STORE_FOLDERS_SNAPSHOT, "readonly");
      const req = tx.objectStore(STORE_FOLDERS_SNAPSHOT).get(instanceId);
      req.onerror = () => reject(idbError(req.error));
      req.onsuccess = () => {
        const raw = req.result as FoldersSnapshotRow | undefined;
        resolve(raw ?? null);
      };
    });
  } catch {
    return null;
  }
}

export async function deleteFoldersSnapshotRow(instanceId: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openMessageCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_FOLDERS_SNAPSHOT, "readwrite");
      tx.onerror = () => reject(idbError(tx.error));
      tx.oncomplete = () => resolve();
      tx.objectStore(STORE_FOLDERS_SNAPSHOT).delete(instanceId);
    });
  } catch {
    // best-effort
  }
}
