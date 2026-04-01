/**
 * Persists sidebar chat-list projection (streams/DMs maps) in IndexedDB for instant paint
 * and stores `lastMessageId` for incremental bootstrap via `fetchMessagesAfterAnchor`.
 */
import type { ChatListSnapshotSerialized } from "~/shared/lib/chat-list-snapshot-serialize.lib";
import { openMessageCacheDb } from "~/shared/lib/message-cache-db";

const STORE_CHAT_LIST_SNAPSHOT = "chatListSnapshot";

function idbError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error("indexedDB error", { cause: reason });
}

export interface ChatListSnapshotRow extends ChatListSnapshotSerialized {
  instanceId: string;
}

export async function persistChatListSnapshotRow(row: ChatListSnapshotRow): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openMessageCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_CHAT_LIST_SNAPSHOT, "readwrite");
      tx.onerror = () => reject(idbError(tx.error));
      tx.oncomplete = () => resolve();
      tx.objectStore(STORE_CHAT_LIST_SNAPSHOT).put(row);
    });
  } catch {
    // best-effort
  }
}

export async function loadChatListSnapshotRow(instanceId: string): Promise<ChatListSnapshotRow | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openMessageCacheDb();
    return await new Promise<ChatListSnapshotRow | null>((resolve, reject) => {
      const tx = db.transaction(STORE_CHAT_LIST_SNAPSHOT, "readonly");
      const req = tx.objectStore(STORE_CHAT_LIST_SNAPSHOT).get(instanceId);
      req.onerror = () => reject(idbError(req.error));
      req.onsuccess = () => resolve((req.result as ChatListSnapshotRow | undefined) ?? null);
    });
  } catch {
    return null;
  }
}

export async function deleteChatListSnapshotRow(instanceId: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openMessageCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_CHAT_LIST_SNAPSHOT, "readwrite");
      tx.onerror = () => reject(idbError(tx.error));
      tx.oncomplete = () => resolve();
      tx.objectStore(STORE_CHAT_LIST_SNAPSHOT).delete(instanceId);
    });
  } catch {
    // best-effort
  }
}
