/**
 * Build / bounds helpers for persisting chat-list projection to IndexedDB.
 */
import type { WorkspaceRawMessage } from "~/shared/api/messenger.types";
import type {
  ChatListSnapshotSerialized,
  ChatListSnapshotMessageLocation,
} from "~/shared/lib/chat-list-snapshot-serialize.lib";
import { serializeStreamEntry } from "~/shared/lib/chat-list-snapshot-serialize.lib";
import { compareMessageTimeline } from "~/shared/lib/message-id.lib";
import type { MessageId } from "~/shared/lib/message-id.lib";
import type { ChatListState } from "./chat-list.model.types";

export function computeMessageIdBounds(messages: readonly WorkspaceRawMessage[]): {
  lastMessageId: MessageId | null;
  oldestMessageId: MessageId | null;
} {
  if (messages.length === 0) return { lastMessageId: null, oldestMessageId: null };
  let oldest = messages[0]!;
  let newest = messages[0]!;
  for (const message of messages) {
    if (compareMessageTimeline(message, oldest) < 0) oldest = message;
    if (compareMessageTimeline(message, newest) > 0) newest = message;
  }
  return { lastMessageId: newest.id, oldestMessageId: oldest.id };
}

interface MessageTimelineBounds {
  newestId: MessageId | null;
  newestTimestamp: number;
  oldestId: MessageId | null;
  oldestTimestamp: number;
}

function updateMessageIdBounds(
  bounds: MessageTimelineBounds,
  messageId: MessageId,
  timestamp: number,
): void {
  const next = { id: messageId, timestamp };
  if (
    bounds.newestId == null ||
    compareMessageTimeline(next, { id: bounds.newestId, timestamp: bounds.newestTimestamp }) > 0
  ) {
    bounds.newestId = messageId;
    bounds.newestTimestamp = timestamp;
  }
  if (
    bounds.oldestId == null ||
    compareMessageTimeline(next, { id: bounds.oldestId, timestamp: bounds.oldestTimestamp }) < 0
  ) {
    bounds.oldestId = messageId;
    bounds.oldestTimestamp = timestamp;
  }
}

function collectMessageIdBoundsFromStreamMaps(
  streamsMap: ChatListState["streamsMap"],
): MessageTimelineBounds {
  const bounds: MessageTimelineBounds = {
    newestId: null,
    newestTimestamp: 0,
    oldestId: null,
    oldestTimestamp: 0,
  };
  for (const s of streamsMap.values()) {
    for (const t of s.topics.values()) {
      if (t.lastMessageId != null) {
        updateMessageIdBounds(bounds, t.lastMessageId, t.ts);
      }
    }
  }
  return bounds;
}

function collectMessageIdBoundsFromDmMaps(
  dmsMap: ChatListState["dmsMap"],
  bounds: MessageTimelineBounds,
): void {
  for (const d of dmsMap.values()) {
    if (d.lastMessageId != null) {
      updateMessageIdBounds(bounds, d.lastMessageId, d.ts);
    }
  }
}

export function computeMessageIdBoundsFromMaps(state: ChatListState): {
  lastMessageId: MessageId | null;
  oldestMessageId: MessageId | null;
} {
  if (state.lastAppliedMessages != null && state.lastAppliedMessages.length > 0) {
    return computeMessageIdBounds(state.lastAppliedMessages);
  }
  const bounds = collectMessageIdBoundsFromStreamMaps(state.streamsMap);
  collectMessageIdBoundsFromDmMaps(state.dmsMap, bounds);
  return { lastMessageId: bounds.newestId, oldestMessageId: bounds.oldestId };
}

export function buildChatListSnapshotSerialized(state: ChatListState): ChatListSnapshotSerialized {
  const bounds = computeMessageIdBoundsFromMaps(state);
  const streamsEntries: ChatListSnapshotSerialized["streamsEntries"] = [];
  for (const [id, s] of state.streamsMap.entries()) {
    streamsEntries.push([id, serializeStreamEntry(s)]);
  }
  const messageIdToLocationEntries: [MessageId, ChatListSnapshotMessageLocation][] = [];
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
