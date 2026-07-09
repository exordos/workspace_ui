/**
 * Best-effort IndexedDB footprint estimates for the diagnostics dashboard.
 */

import { openWorkspaceMessengerCacheDb } from "~/shared/lib/workspace-messenger-cache-db";
import { WORKSPACE_MESSENGER_CACHE_STORES } from "~/shared/lib/workspace-messenger-cache-db-upgrade.lib";

export interface DiagnosticIdbSnapshot {
  ownerKey: string;
  hasOwnerMeta: boolean;
  ownerMetaLastHydratedAt: number | null;
  streamsCount: number;
  conversationsCount: number;
  messagesCount: number;
  foldersCount: number | null;
}

function countRowsByOwner(db: IDBDatabase, storeName: string, ownerKey: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).index("byOwner").count(ownerKey);
    req.onerror = () => reject(req.error ?? new Error("idb count failed"));
    req.onsuccess = () => resolve(req.result);
  });
}

interface OwnerMetaDiagnosticRow {
  exists: boolean;
  lastHydratedAt: number | null;
}

function readOwnerMetaDiagnosticRow(
  db: IDBDatabase,
  ownerKey: string,
): Promise<OwnerMetaDiagnosticRow> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WORKSPACE_MESSENGER_CACHE_STORES.ownerMeta, "readonly");
    const req = tx.objectStore(WORKSPACE_MESSENGER_CACHE_STORES.ownerMeta).get(ownerKey);
    req.onerror = () => reject(req.error ?? new Error("idb owner meta read failed"));
    req.onsuccess = () => {
      const row = req.result as { lastHydratedAt?: unknown } | undefined;
      const value = row?.lastHydratedAt;
      resolve({
        exists: row != null,
        lastHydratedAt: typeof value === "number" && Number.isFinite(value) ? value : null,
      });
    };
  });
}

/** Estimates local Workspace messenger cache footprint for the current owner. */
export async function estimateDiagnosticsIdbFootprint(
  ownerKey: string | null,
): Promise<DiagnosticIdbSnapshot | null> {
  if (typeof indexedDB === "undefined") return null;
  if (ownerKey == null || ownerKey.length === 0) return null;

  try {
    const db = await openWorkspaceMessengerCacheDb();
    const [ownerMeta, streamsCount, conversationsCount, messagesCount, foldersCount] =
      await Promise.all([
        readOwnerMetaDiagnosticRow(db, ownerKey),
        countRowsByOwner(db, WORKSPACE_MESSENGER_CACHE_STORES.streams, ownerKey),
        countRowsByOwner(db, WORKSPACE_MESSENGER_CACHE_STORES.conversations, ownerKey),
        countRowsByOwner(db, WORKSPACE_MESSENGER_CACHE_STORES.messages, ownerKey),
        countRowsByOwner(db, WORKSPACE_MESSENGER_CACHE_STORES.folders, ownerKey),
      ]);

    return {
      ownerKey,
      hasOwnerMeta: ownerMeta.exists,
      ownerMetaLastHydratedAt: ownerMeta.lastHydratedAt,
      streamsCount,
      conversationsCount,
      messagesCount,
      foldersCount,
    };
  } catch {
    return null;
  }
}
