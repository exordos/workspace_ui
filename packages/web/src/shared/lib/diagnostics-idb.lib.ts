/**
 * Best-effort IndexedDB footprint estimates for the diagnostics dashboard.
 */

import { loadChatListSnapshotRow } from "~/shared/lib/chat-list-snapshot-db";
import { loadFoldersSnapshotRow } from "~/shared/lib/folders-snapshot-db";
import { openMessageCacheDb } from "~/shared/lib/message-cache-db";

export interface DiagnosticIdbSnapshot {
  messagePartitionCount: number;
  hasChatListSnapshot: boolean;
  chatListSnapshotUpdatedAt: number | null;
  hasFoldersSnapshot: boolean;
  foldersCount: number | null;
}

async function countObjectStoreKeys(storeName: string): Promise<number> {
  const db = await openMessageCacheDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).count();
    req.onerror = () => reject(req.error ?? new Error("idb count failed"));
    req.onsuccess = () => resolve(req.result);
  });
}

/** Estimates local cache footprint for the current instance (async, best-effort). */
export async function estimateDiagnosticsIdbFootprint(
  instanceId: string | null,
): Promise<DiagnosticIdbSnapshot | null> {
  if (typeof indexedDB === "undefined") return null;

  try {
    const messagePartitionCount = await countObjectStoreKeys("chatMeta");
    const chatListRow =
      instanceId != null && instanceId.length > 0
        ? await loadChatListSnapshotRow(instanceId)
        : null;
    const foldersRow =
      instanceId != null && instanceId.length > 0 ? await loadFoldersSnapshotRow(instanceId) : null;

    return {
      messagePartitionCount,
      hasChatListSnapshot: chatListRow != null,
      chatListSnapshotUpdatedAt: chatListRow?.updatedAt ?? null,
      hasFoldersSnapshot: foldersRow != null,
      foldersCount: foldersRow?.folders.length ?? null,
    };
  } catch {
    return null;
  }
}
