/**
 * Recent desktop-notification deduplication by message id.
 *
 * Prevents duplicate OS toasts when the same message is delivered via long-poll and FCM.
 */
import { isMessageId } from "./message-id.lib";
import type { MessageId } from "./message-id.lib";

const MAX_RECENT_IDS = 200;
const recentIds: MessageId[] = [];
const recentIdSet = new Set<MessageId>();

export function registerNotifiedMessageId(messageId: MessageId): void {
  if (!isMessageId(messageId)) return;
  if (recentIdSet.has(messageId)) return;

  recentIds.push(messageId);
  recentIdSet.add(messageId);

  while (recentIds.length > MAX_RECENT_IDS) {
    const removed = recentIds.shift();
    if (removed != null) {
      recentIdSet.delete(removed);
    }
  }
}

export function wasRecentlyNotified(messageId: MessageId): boolean {
  return recentIdSet.has(messageId);
}

export function clearNotifiedMessageIds(): void {
  recentIds.length = 0;
  recentIdSet.clear();
}
