/**
 * IndexedDB persistence for avatar image blobs (per Zulip instance, LRU eviction).
 *
 * Uses the shared `workspace-message-cache-v1` database (store `avatarBlobs`).
 *
 * Usage:
 *   import { getAvatarBlobCacheRow, putAvatarBlobCacheRow } from "~/shared/lib/avatar-blob-cache-db";
 */
import {
  AVATAR_BLOB_CACHE_MAX_TOTAL_BYTES,
  AVATAR_BLOB_CACHE_QUOTA_RETRY_TOTAL_BYTES,
  avatarBlobCacheRowId,
  pickAvatarBlobEvictionIds,
  type AvatarBlobCacheEvictionRow,
} from "~/shared/lib/avatar-blob-cache.lib";
import { openMessageCacheDb, STORE_AVATAR_BLOBS } from "~/shared/lib/message-cache-db";

function idbError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error("indexedDB error", { cause: reason });
}

export interface AvatarBlobCacheRow {
  /** `${instanceId}:${cacheKey}` */
  id: string;
  instanceId: string;
  cacheKey: string;
  blob: Blob;
  mimeType: string;
  byteSize: number;
  fetchedAt: number;
  lastAccessedAt: number;
  avatarVersion: number;
}

async function listAvatarBlobRowsForInstance(
  db: IDBDatabase,
  instanceId: string,
): Promise<AvatarBlobCacheRow[]> {
  return await new Promise<AvatarBlobCacheRow[]>((resolve, reject) => {
    const tx = db.transaction(STORE_AVATAR_BLOBS, "readonly");
    const store = tx.objectStore(STORE_AVATAR_BLOBS);
    const index = store.index("byInstanceLastAccessed");
    const range = IDBKeyRange.bound([instanceId, 0], [instanceId, Number.MAX_SAFE_INTEGER]);
    const req = index.getAll(range);
    req.onerror = () => reject(idbError(req.error));
    req.onsuccess = () => {
      const rows = (req.result as AvatarBlobCacheRow[] | undefined) ?? [];
      resolve(rows);
    };
  });
}

async function deleteAvatarBlobRowsByIds(db: IDBDatabase, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_AVATAR_BLOBS, "readwrite");
    tx.onerror = () => reject(idbError(tx.error));
    tx.oncomplete = () => resolve();
    const store = tx.objectStore(STORE_AVATAR_BLOBS);
    for (const id of ids) {
      store.delete(id);
    }
  });
}

async function runEvictionForInstance(
  db: IDBDatabase,
  instanceId: string,
  incomingBytes: number,
  maxTotalBytes: number,
): Promise<void> {
  const rows = await listAvatarBlobRowsForInstance(db, instanceId);
  const evictionInput: AvatarBlobCacheEvictionRow[] = rows.map((row) => ({
    id: row.id,
    byteSize: row.byteSize,
    lastAccessedAt: row.lastAccessedAt,
  }));
  const idsToDelete = pickAvatarBlobEvictionIds(evictionInput, {
    incomingBytes,
    maxTotalBytes,
  });
  await deleteAvatarBlobRowsByIds(db, idsToDelete);
}

export async function getAvatarBlobCacheRow(
  instanceId: string,
  cacheKey: string,
): Promise<AvatarBlobCacheRow | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openMessageCacheDb();
    const id = avatarBlobCacheRowId(instanceId, cacheKey);
    return await new Promise<AvatarBlobCacheRow | null>((resolve, reject) => {
      const tx = db.transaction(STORE_AVATAR_BLOBS, "readonly");
      const req = tx.objectStore(STORE_AVATAR_BLOBS).get(id);
      req.onerror = () => reject(idbError(req.error));
      req.onsuccess = () => resolve((req.result as AvatarBlobCacheRow | undefined) ?? null);
    });
  } catch {
    return null;
  }
}

export async function touchAvatarBlobCacheRow(
  instanceId: string,
  cacheKey: string,
  lastAccessedAt: number,
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openMessageCacheDb();
    const id = avatarBlobCacheRowId(instanceId, cacheKey);
    const existing = await getAvatarBlobCacheRow(instanceId, cacheKey);
    if (existing == null) return;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_AVATAR_BLOBS, "readwrite");
      tx.onerror = () => reject(idbError(tx.error));
      tx.oncomplete = () => resolve();
      tx.objectStore(STORE_AVATAR_BLOBS).put({
        ...existing,
        id,
        lastAccessedAt,
      } satisfies AvatarBlobCacheRow);
    });
  } catch {
    // best-effort
  }
}

export async function putAvatarBlobCacheRow(
  row: Omit<AvatarBlobCacheRow, "id"> & { id?: string },
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const id = row.id ?? avatarBlobCacheRowId(row.instanceId, row.cacheKey);

  const write = async (maxTotalBytes: number): Promise<void> => {
    const db = await openMessageCacheDb();
    await runEvictionForInstance(db, row.instanceId, row.byteSize, maxTotalBytes);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_AVATAR_BLOBS, "readwrite");
      tx.onerror = () => reject(idbError(tx.error));
      tx.oncomplete = () => resolve();
      tx.objectStore(STORE_AVATAR_BLOBS).put({
        ...row,
        id,
      } satisfies AvatarBlobCacheRow);
    });
  };

  try {
    await write(AVATAR_BLOB_CACHE_MAX_TOTAL_BYTES);
  } catch (error) {
    const isQuota =
      error instanceof DOMException
        ? error.name === "QuotaExceededError"
        : error instanceof Error && error.name === "QuotaExceededError";
    if (!isQuota) return;
    try {
      const db = await openMessageCacheDb();
      await runEvictionForInstance(
        db,
        row.instanceId,
        row.byteSize,
        AVATAR_BLOB_CACHE_QUOTA_RETRY_TOTAL_BYTES,
      );
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_AVATAR_BLOBS, "readwrite");
        tx.onerror = () => reject(idbError(tx.error));
        tx.oncomplete = () => resolve();
        tx.objectStore(STORE_AVATAR_BLOBS).put({
          ...row,
          id,
        } satisfies AvatarBlobCacheRow);
      });
    } catch {
      // best-effort — UI falls back to network URL
    }
  }
}

export async function clearAvatarBlobCacheForInstance(instanceId: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openMessageCacheDb();
    const rows = await listAvatarBlobRowsForInstance(db, instanceId);
    await deleteAvatarBlobRowsByIds(
      db,
      rows.map((r) => r.id),
    );
  } catch {
    // best-effort
  }
}

export async function clearAllAvatarBlobCacheForTests(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openMessageCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_AVATAR_BLOBS, "readwrite");
      tx.onerror = () => reject(idbError(tx.error));
      tx.oncomplete = () => resolve();
      tx.objectStore(STORE_AVATAR_BLOBS).clear();
    });
  } catch {
    // best-effort
  }
}
