/**
 * Persists GET /users/{id}/status results (per Zulip instance + user) in IndexedDB
 * for hydrate after reload and TTL coordination via user.api.orchestrator.
 *
 * Payload shape matches UserStatus in entities/user (serializable subset for IDB).
 *
 * Usage:
 *   import { putUserStatusCacheRow, getUserStatusCacheRow } from "~/shared/lib/user-status-cache-db";
 */
import { openMessageCacheDb } from "~/shared/lib/message-cache-db";

const STORE_USER_STATUS_CACHE = "userStatusCache";

function idbError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error("indexedDB error", { cause: reason });
}

/** Serializable custom status snapshot (aligned with Zulip GET /users/{id}/status). */
export interface UserStatusCachePayload {
  text: string;
  emojiName?: string;
  emojiCode?: string;
  reactionType?: "unicode_emoji" | "realm_emoji" | "zulip_extra_emoji";
  away: boolean;
}

export interface UserStatusCacheRow {
  /** `${instanceId}:${userId}` */
  id: string;
  instanceId: string;
  userId: number;
  status: UserStatusCachePayload | null;
  fetchedAt: number;
}

function rowId(instanceId: string, userId: number): string {
  return `${instanceId}:${userId}`;
}

export async function putUserStatusCacheRow(row: Omit<UserStatusCacheRow, "id"> & { id?: string }): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const id = row.id ?? rowId(row.instanceId, row.userId);
    const db = await openMessageCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_USER_STATUS_CACHE, "readwrite");
      tx.onerror = () => reject(idbError(tx.error));
      tx.oncomplete = () => resolve();
      tx.objectStore(STORE_USER_STATUS_CACHE).put({
        ...row,
        id,
      } satisfies UserStatusCacheRow);
    });
  } catch {
    // best-effort
  }
}

export async function getUserStatusCacheRow(
  instanceId: string,
  userId: number,
): Promise<UserStatusCacheRow | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openMessageCacheDb();
    return await new Promise<UserStatusCacheRow | null>((resolve, reject) => {
      const tx = db.transaction(STORE_USER_STATUS_CACHE, "readonly");
      const req = tx.objectStore(STORE_USER_STATUS_CACHE).get(rowId(instanceId, userId));
      req.onerror = () => reject(idbError(req.error));
      req.onsuccess = () => resolve((req.result as UserStatusCacheRow | undefined) ?? null);
    });
  } catch {
    return null;
  }
}

export async function deleteUserStatusCacheRow(instanceId: string, userId: number): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openMessageCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_USER_STATUS_CACHE, "readwrite");
      tx.onerror = () => reject(idbError(tx.error));
      tx.oncomplete = () => resolve();
      tx.objectStore(STORE_USER_STATUS_CACHE).delete(rowId(instanceId, userId));
    });
  } catch {
    // best-effort
  }
}
