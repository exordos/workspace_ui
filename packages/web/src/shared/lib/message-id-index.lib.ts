/**
 * O(1) message lookup by id for hot paths (read receipts, optimistic mark-read).
 *
 * Usage:
 *   import { buildMessageIdMap, createMessageIdSet } from "~/shared/lib/message-id-index.lib";
 */

export function buildMessageIdMap<T extends { id: number }>(
  messages: readonly T[],
): Map<number, T> {
  const map = new Map<number, T>();
  for (const message of messages) {
    map.set(message.id, message);
  }
  return map;
}

export function createMessageIdSet(messages: readonly { id: number }[]): Set<number> {
  const ids = new Set<number>();
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
  viewportIds: Iterable<number>,
  messageById: ReadonlyMap<number, ViewportUnreadMessageSlice>,
  currentUserId: number | null,
): number[] {
  const out: number[] = [];
  for (const id of viewportIds) {
    const msg = messageById.get(id);
    if (
      msg != null &&
      !(msg.flags ?? []).includes("read") &&
      (currentUserId == null || msg.sender_id !== currentUserId)
    ) {
      out.push(id);
    }
  }
  return out;
}

/** Ids absent from both store and effective lists — O(K). */
export function messageIdsMissingFromBothLists(
  messageIds: readonly number[],
  storeIds: ReadonlySet<number>,
  effectiveIds: ReadonlySet<number>,
): number[] {
  const missing: number[] = [];
  for (const id of messageIds) {
    if (!storeIds.has(id) && !effectiveIds.has(id)) {
      missing.push(id);
    }
  }
  return missing;
}
