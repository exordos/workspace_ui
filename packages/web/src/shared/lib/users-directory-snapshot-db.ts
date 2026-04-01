/**
 * Persists GET /users directory (per Zulip instance) in IndexedDB for instant hydrate
 * after reload; network fetch still replaces/merges fresh data.
 */
import type { ZulipUserMember } from "~/shared/api/zulip.types";
import { openMessageCacheDb } from "~/shared/lib/message-cache-db";

const STORE_USERS_DIRECTORY = "usersDirectory";

function idbError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error("indexedDB error", { cause: reason });
}

export type UsersDirectorySnapshotVersion = 1;

export interface UsersDirectorySnapshotRow {
  instanceId: string;
  version: UsersDirectorySnapshotVersion;
  savedAt: number;
  members: ZulipUserMember[];
}

export async function persistUsersDirectoryRow(row: UsersDirectorySnapshotRow): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openMessageCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_USERS_DIRECTORY, "readwrite");
      tx.onerror = () => reject(idbError(tx.error));
      tx.oncomplete = () => resolve();
      tx.objectStore(STORE_USERS_DIRECTORY).put(row);
    });
  } catch {
    // best-effort
  }
}

export async function loadUsersDirectoryRow(instanceId: string): Promise<UsersDirectorySnapshotRow | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openMessageCacheDb();
    return await new Promise<UsersDirectorySnapshotRow | null>((resolve, reject) => {
      const tx = db.transaction(STORE_USERS_DIRECTORY, "readonly");
      const req = tx.objectStore(STORE_USERS_DIRECTORY).get(instanceId);
      req.onerror = () => reject(idbError(req.error));
      req.onsuccess = () => resolve((req.result as UsersDirectorySnapshotRow | undefined) ?? null);
    });
  } catch {
    return null;
  }
}

export async function deleteUsersDirectoryRow(instanceId: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openMessageCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_USERS_DIRECTORY, "readwrite");
      tx.onerror = () => reject(idbError(tx.error));
      tx.oncomplete = () => resolve();
      tx.objectStore(STORE_USERS_DIRECTORY).delete(instanceId);
    });
  } catch {
    // best-effort
  }
}
