/**
 * O(1) message lookup by id for hot paths.
 *
 * Usage:
 *   import { buildMessageIdMap } from "~/shared/lib/message-id-index.lib";
 */

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
