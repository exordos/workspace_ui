/**
 * IndexedDB persistence for mute-state snapshots.
 * Gives the UI instant mute state on cold start before register completes.
 */
import type {
  WorkspaceStreamNotificationMode,
  WorkspaceTopicNotificationMode,
} from "~/shared/api/messenger.types";
import { openMessageCacheDb } from "~/shared/lib/message-cache-db";

const STORE_MUTE_SNAPSHOT = "muteSnapshot";

export type MuteSnapshotRowVersion = 1 | 2 | 3 | 4;

export interface MuteSnapshotTopicRow {
  streamId: string;
  topic: string;
}

export interface MuteSnapshotRowV1 {
  instanceId: string;
  version: 1;
  savedAt: number;
  mutedStreamIds: string[];
  mutedTopics: MuteSnapshotTopicRow[];
  unmutedTopics: MuteSnapshotTopicRow[];
  followedTopics: MuteSnapshotTopicRow[];
}

export interface MuteSnapshotRowV2 extends Omit<MuteSnapshotRowV1, "version"> {
  version: 2;
}

export interface MuteSnapshotStreamNotificationModeRow {
  streamId: string;
  mode: WorkspaceStreamNotificationMode;
}

export interface MuteSnapshotRowV3 extends Omit<MuteSnapshotRowV1, "version"> {
  version: 3;
  streamNotificationModes: MuteSnapshotStreamNotificationModeRow[];
}

export interface MuteSnapshotTopicNotificationModeRow {
  streamId: string;
  topic: string;
  mode: WorkspaceTopicNotificationMode;
}

export interface MuteSnapshotRowV4 {
  instanceId: string;
  version: 4;
  savedAt: number;
  mutedStreamIds: string[];
  streamNotificationModes: MuteSnapshotStreamNotificationModeRow[];
  topicNotificationModes: MuteSnapshotTopicNotificationModeRow[];
}

export type MuteSnapshotRow =
  | MuteSnapshotRowV1
  | MuteSnapshotRowV2
  | MuteSnapshotRowV3
  | MuteSnapshotRowV4;

function normalizeMuteSnapshotRow(row: MuteSnapshotRow): MuteSnapshotRowV4 {
  if (row.version === 4) {
    return row;
  }
  return {
    instanceId: row.instanceId,
    version: 4,
    savedAt: row.savedAt,
    mutedStreamIds: row.mutedStreamIds,
    streamNotificationModes: row.version === 3 ? row.streamNotificationModes : [],
    topicNotificationModes: [],
  };
}

function idbError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error("indexedDB error", { cause: reason });
}

/** Write-through after local changes or successful register; best-effort (must not crash UI). */
export async function persistMuteSnapshotRow(row: MuteSnapshotRowV4): Promise<void> {
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

export async function loadMuteSnapshotRow(instanceId: string): Promise<MuteSnapshotRowV4 | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openMessageCacheDb();
    return await new Promise<MuteSnapshotRowV4 | null>((resolve, reject) => {
      const tx = db.transaction(STORE_MUTE_SNAPSHOT, "readonly");
      const req = tx.objectStore(STORE_MUTE_SNAPSHOT).get(instanceId);
      req.onerror = () => reject(idbError(req.error));
      req.onsuccess = () => {
        const row = req.result as MuteSnapshotRow | undefined;
        if (row == null) {
          resolve(null);
          return;
        }
        resolve(normalizeMuteSnapshotRow(row));
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
