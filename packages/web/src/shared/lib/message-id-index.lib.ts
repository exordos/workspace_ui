/**
 * O(1) message lookup by id for hot paths (read receipts, optimistic mark-read).
 *
 * Usage:
 *   import { buildMessageIdMap, createMessageIdSet } from "~/shared/lib/message-id-index.lib";
 */

import { numericUserIdOrNull, type UserId } from "./user-id.lib";
import type { MessageId } from "./message-id.lib";

export function buildMessageIdMap<T extends { id: MessageId }>(
  messages: readonly T[],
): Map<MessageId, T> {
  const map = new Map<MessageId, T>();
  for (const message of messages) {
    map.set(message.id, message);
  }
  return map;
}

export function createMessageIdSet(messages: readonly { id: MessageId }[]): Set<MessageId> {
  const ids = new Set<MessageId>();
  for (const message of messages) {
    ids.add(message.id);
  }
  return ids;
}

export interface ViewportUnreadMessageSlice {
  flags?: string[];
  sender_id: number;
}

/** Filters viewport unread ids using a pre-built id index — O(V) not O(V×M). */
export function filterViewportUnreadIdsForReadDispatch(
  viewportIds: Iterable<MessageId>,
  messageById: ReadonlyMap<MessageId, ViewportUnreadMessageSlice>,
  currentUserId: UserId | null,
): MessageId[] {
  const numericCurrentUserId = numericUserIdOrNull(currentUserId);
  const out: MessageId[] = [];
  for (const id of viewportIds) {
    const msg = messageById.get(id);
    if (
      msg != null &&
      !(msg.flags ?? []).includes("read") &&
      (numericCurrentUserId == null || msg.sender_id !== numericCurrentUserId)
    ) {
      out.push(id);
    }
  }
  return out;
}

/** Ids absent from both store and effective lists — O(K). */
export function messageIdsMissingFromBothLists(
  messageIds: readonly MessageId[],
  storeIds: ReadonlySet<MessageId>,
  effectiveIds: ReadonlySet<MessageId>,
): MessageId[] {
  const missing: MessageId[] = [];
  for (const id of messageIds) {
    if (!storeIds.has(id) && !effectiveIds.has(id)) {
      missing.push(id);
    }
  }
  return missing;
}
