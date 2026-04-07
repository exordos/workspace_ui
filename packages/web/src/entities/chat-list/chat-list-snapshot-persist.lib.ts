/**
 * Persists current chat-list store projection to IndexedDB for the active instance.
 */
import { persistChatListSnapshotRow } from "~/shared/lib/chat-list-snapshot-db";
import { buildChatListSnapshotSerialized } from "./chat-list-snapshot.lib";
import { useChatListStore } from "./chat-list.model";

export async function persistChatListSnapshotToIndexedDb(instanceId: string): Promise<void> {
  const state = useChatListStore.getState();
  const data = buildChatListSnapshotSerialized(state);
  await persistChatListSnapshotRow({ instanceId, ...data });
}
