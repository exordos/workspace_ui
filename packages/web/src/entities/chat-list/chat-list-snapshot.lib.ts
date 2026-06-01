/**
 * Build / bounds helpers for persisting chat-list projection to IndexedDB.
 */
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import type {
  ChatListSnapshotSerialized,
  ChatListSnapshotMessageLocation,
} from "~/shared/lib/chat-list-snapshot-serialize.lib";
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

function updateMessageIdBounds(
  bounds: { maxId: number; minId: number; any: boolean },
  messageId: number,
): void {
  bounds.any = true;
  if (messageId > bounds.maxId) bounds.maxId = messageId;
  if (messageId < bounds.minId) bounds.minId = messageId;
}

function collectMessageIdBoundsFromStreamMaps(streamsMap: ChatListState["streamsMap"]): {
  maxId: number;
  minId: number;
  any: boolean;
} {
  const bounds = { maxId: 0, minId: Number.MAX_SAFE_INTEGER, any: false };
  for (const s of streamsMap.values()) {
    for (const t of s.topics.values()) {
      if (t.lastMessageId != null) {
        updateMessageIdBounds(bounds, t.lastMessageId);
      }
    }
  }
  return bounds;
}

function collectMessageIdBoundsFromDmMaps(
  dmsMap: ChatListState["dmsMap"],
  bounds: { maxId: number; minId: number; any: boolean },
): void {
  for (const d of dmsMap.values()) {
    if (d.lastMessageId != null) {
      updateMessageIdBounds(bounds, d.lastMessageId);
    }
  }
}

export function computeMessageIdBoundsFromMaps(state: ChatListState): {
  lastMessageId: number | null;
  oldestMessageId: number | null;
} {
  if (state.lastAppliedMessages != null && state.lastAppliedMessages.length > 0) {
    return computeMessageIdBounds(state.lastAppliedMessages);
  }
  const bounds = collectMessageIdBoundsFromStreamMaps(state.streamsMap);
  collectMessageIdBoundsFromDmMaps(state.dmsMap, bounds);
  if (!bounds.any) return { lastMessageId: null, oldestMessageId: null };
  return { lastMessageId: bounds.maxId, oldestMessageId: bounds.minId };
}

export function buildChatListSnapshotSerialized(state: ChatListState): ChatListSnapshotSerialized {
  const bounds = computeMessageIdBoundsFromMaps(state);
  const streamsEntries: ChatListSnapshotSerialized["streamsEntries"] = [];
  for (const [id, s] of state.streamsMap.entries()) {
    streamsEntries.push([id, serializeStreamEntry(s)]);
  }
  const messageIdToLocationEntries: [number, ChatListSnapshotMessageLocation][] = [];
  for (const [id, loc] of state.messageIdToLocation.entries()) {
    messageIdToLocationEntries.push([id, loc]);
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
