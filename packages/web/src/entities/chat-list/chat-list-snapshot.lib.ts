/**
 * Build / bounds helpers for persisting chat-list projection to IndexedDB.
 */
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import type { ChatListSnapshotSerialized, ChatListSnapshotMessageLocation  } from "~/shared/lib/chat-list-snapshot-serialize.lib";
import { serializeStreamEntry } from "~/shared/lib/chat-list-snapshot-serialize.lib";
import type { ChatListState } from "./chat-list.model.types";

export function computeMessageIdBounds(messages: readonly ZulipRawMessage[]): {
  lastMessageId: number | null;
  oldestMessageId: number | null;
} {
  if (messages.length === 0) return { lastMessageId: null, oldestMessageId: null };
  let min = messages[0]!.id;
  let max = messages[0]!.id;
  for (const m of messages) {
    if (m.id < min) min = m.id;
    if (m.id > max) max = m.id;
  }
  return { lastMessageId: max, oldestMessageId: min };
}

export function computeMessageIdBoundsFromMaps(state: ChatListState): {
  lastMessageId: number | null;
  oldestMessageId: number | null;
} {
  if (state.lastAppliedMessages != null && state.lastAppliedMessages.length > 0) {
    return computeMessageIdBounds(state.lastAppliedMessages);
  }
  let maxId = 0;
  let minId = Number.MAX_SAFE_INTEGER;
  let any = false;
  for (const s of state.streamsMap.values()) {
    for (const t of s.topics.values()) {
      if (t.lastMessageId != null) {
        any = true;
        if (t.lastMessageId > maxId) maxId = t.lastMessageId;
        if (t.lastMessageId < minId) minId = t.lastMessageId;
      }
    }
  }
  for (const d of state.dmsMap.values()) {
    if (d.lastMessageId != null) {
      any = true;
      if (d.lastMessageId > maxId) maxId = d.lastMessageId;
      if (d.lastMessageId < minId) minId = d.lastMessageId;
    }
  }
  if (!any) return { lastMessageId: null, oldestMessageId: null };
  return { lastMessageId: maxId, oldestMessageId: minId };
}

export function buildChatListSnapshotSerialized(state: ChatListState): ChatListSnapshotSerialized {
  const bounds = computeMessageIdBoundsFromMaps(state);
  const streamsEntries: ChatListSnapshotSerialized["streamsEntries"] = [];
  for (const [id, s] of state.streamsMap.entries()) {
    streamsEntries.push([id, serializeStreamEntry(s)]);
  }
  const messageIdToLocationEntries: [number, ChatListSnapshotMessageLocation][] = [];
  for (const [id, loc] of state.messageIdToLocation.entries()) {
    messageIdToLocationEntries.push([id, loc as ChatListSnapshotMessageLocation]);
  }
  return {
    version: 1,
    currentUserId: state.currentUserId,
    lastMessageId: bounds.lastMessageId,
    oldestMessageId: bounds.oldestMessageId,
    streamsEntries,
    dmsEntries: Array.from(state.dmsMap.entries()),
    messageIdToLocationEntries,
    updatedAt: Date.now(),
  };
}
