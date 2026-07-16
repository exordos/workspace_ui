/** Persistent cache for messenger entity snapshots that are not message bodies or binary files. */
import type {
  MessengerMeStream,
  MessengerStreamTopic,
  MessengerUserMember,
  WorkspaceStreamBinding,
} from "~/shared/api/messenger.types";
import { openMessageCacheDb } from "~/shared/lib/message-cache-db";
import type { UserId } from "~/shared/lib/user-id.lib";

const STORE_MESSENGER_ENTITIES_SNAPSHOT = "messengerEntitiesSnapshot";

function idbError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error("indexedDB error", { cause: reason });
}

export function buildMessengerEntitiesCacheKey(accountScope: string, projectId: string): string {
  return `${accountScope}|${projectId.trim().toLowerCase()}`;
}

export interface MessengerEntitiesSnapshotRow {
  cacheKey: string;
  accountScope: string;
  projectId: string;
  version: 1;
  savedAt: number;
  currentUserId: UserId;
  users: MessengerUserMember[];
  streams: MessengerMeStream[];
  topics: MessengerStreamTopic[];
  bindings: WorkspaceStreamBinding[];
}

export async function persistMessengerEntitiesSnapshotRow(
  row: MessengerEntitiesSnapshotRow,
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openMessageCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_MESSENGER_ENTITIES_SNAPSHOT, "readwrite");
      tx.onerror = () => reject(idbError(tx.error));
      tx.oncomplete = () => resolve();
      tx.objectStore(STORE_MESSENGER_ENTITIES_SNAPSHOT).put(row);
    });
  } catch {
    // Best-effort cache persistence must not block the messenger.
  }
}

export async function loadMessengerEntitiesSnapshotByAccount(
  accountScope: string,
): Promise<MessengerEntitiesSnapshotRow | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openMessageCacheDb();
    return await new Promise<MessengerEntitiesSnapshotRow | null>((resolve, reject) => {
      const tx = db.transaction(STORE_MESSENGER_ENTITIES_SNAPSHOT, "readonly");
      const request = tx
        .objectStore(STORE_MESSENGER_ENTITIES_SNAPSHOT)
        .index("byAccountScope")
        .getAll(accountScope, 2);
      request.onerror = () => reject(idbError(request.error));
      request.onsuccess = () => {
        const rows = request.result as MessengerEntitiesSnapshotRow[];
        resolve(rows.length === 1 ? rows[0]! : null);
      };
    });
  } catch {
    return null;
  }
}

export async function loadMessengerEntitiesSnapshotRow(
  cacheKey: string,
): Promise<MessengerEntitiesSnapshotRow | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openMessageCacheDb();
    return await new Promise<MessengerEntitiesSnapshotRow | null>((resolve, reject) => {
      const tx = db.transaction(STORE_MESSENGER_ENTITIES_SNAPSHOT, "readonly");
      const request = tx.objectStore(STORE_MESSENGER_ENTITIES_SNAPSHOT).get(cacheKey);
      request.onerror = () => reject(idbError(request.error));
      request.onsuccess = () =>
        resolve((request.result as MessengerEntitiesSnapshotRow | undefined) ?? null);
    });
  } catch {
    return null;
  }
}

export async function deleteMessengerEntitiesSnapshotsByAccount(
  accountScope: string,
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openMessageCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_MESSENGER_ENTITIES_SNAPSHOT, "readwrite");
      const store = tx.objectStore(STORE_MESSENGER_ENTITIES_SNAPSHOT);
      const request = store.index("byAccountScope").openKeyCursor(IDBKeyRange.only(accountScope));
      request.onerror = () => reject(idbError(request.error));
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor == null) return;
        store.delete(cursor.primaryKey);
        cursor.continue();
      };
      tx.onerror = () => reject(idbError(tx.error));
      tx.oncomplete = () => resolve();
    });
  } catch {
    // Best-effort cache invalidation.
  }
}

export async function updateMessengerEntitiesSnapshotRow(
  cacheKey: string,
  update: (current: MessengerEntitiesSnapshotRow) => MessengerEntitiesSnapshotRow,
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openMessageCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_MESSENGER_ENTITIES_SNAPSHOT, "readwrite");
      const store = tx.objectStore(STORE_MESSENGER_ENTITIES_SNAPSHOT);
      const request = store.get(cacheKey);
      request.onerror = () => reject(idbError(request.error));
      request.onsuccess = () => {
        const current = request.result as MessengerEntitiesSnapshotRow | undefined;
        if (current != null) store.put(update(current));
      };
      tx.onerror = () => reject(idbError(tx.error));
      tx.oncomplete = () => resolve();
    });
  } catch {
    // Best-effort cache persistence.
  }
}
