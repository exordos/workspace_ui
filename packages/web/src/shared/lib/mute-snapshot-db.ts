/**
 * IndexedDB persistence for mute-state snapshots.
 * Gives the UI instant mute state on cold start before register completes.
 */
import { openMessageCacheDb } from "~/shared/lib/message-cache-db";

const STORE_MUTE_SNAPSHOT = "muteSnapshot";

export type MuteSnapshotRowVersion = 1;

export interface MuteSnapshotTopicRow {
  streamId: number;
  topic: string;
}

export interface MuteSnapshotRow {
  instanceId: string;
  version: MuteSnapshotRowVersion;
  savedAt: number;
  mutedStreamIds: number[];
  mutedTopics: MuteSnapshotTopicRow[];
  unmutedTopics: MuteSnapshotTopicRow[];
  followedTopics: MuteSnapshotTopicRow[];
}

function idbError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error("indexedDB error", { cause: reason });
}

/** Write-through after local changes or successful register; best-effort (must not crash UI). */
export async function persistMuteSnapshotRow(row: MuteSnapshotRow): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openMessageCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_MUTE_SNAPSHOT, "readwrite");
      tx.onerror = () => reject(idbError(tx.error));
      tx.oncomplete = () => resolve();
      tx.objectStore(STORE_MUTE_SNAPSHOT).put(row);
    });
  } catch {
    // best-effort
  }
}

export async function loadMuteSnapshotRow(instanceId: string): Promise<MuteSnapshotRow | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openMessageCacheDb();
    return await new Promise<MuteSnapshotRow | null>((resolve, reject) => {
      const tx = db.transaction(STORE_MUTE_SNAPSHOT, "readonly");
      const req = tx.objectStore(STORE_MUTE_SNAPSHOT).get(instanceId);
      req.onerror = () => reject(idbError(req.error));
      req.onsuccess = () => {
        const row = req.result as MuteSnapshotRow | undefined;
        if (row == null) {
          resolve(null);
          return;
        }
        resolve(row);
      };
    });
  } catch {
    return null;
  }
}

/** Best-effort cleanup when an instance snapshot should be removed. */
export async function deleteMuteSnapshotRow(instanceId: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openMessageCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_MUTE_SNAPSHOT, "readwrite");
      tx.onerror = () => reject(idbError(tx.error));
      tx.oncomplete = () => resolve();
      tx.objectStore(STORE_MUTE_SNAPSHOT).delete(instanceId);
    });
  } catch {
    // best-effort
  }
}
