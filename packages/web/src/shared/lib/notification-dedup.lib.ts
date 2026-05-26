/**
 * Recent desktop-notification deduplication by message id.
 *
 * Prevents duplicate OS toasts when the same message is delivered via long-poll and FCM.
 */

const MAX_RECENT_IDS = 200;
const recentIds: number[] = [];
const recentIdSet = new Set<number>();

export function registerNotifiedMessageId(messageId: number): void {
  if (!Number.isInteger(messageId) || messageId <= 0) return;
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

export function wasRecentlyNotified(messageId: number): boolean {
  return recentIdSet.has(messageId);
}

export function clearNotifiedMessageIds(): void {
  recentIds.length = 0;
  recentIdSet.clear();
}
