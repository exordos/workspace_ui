/**
 * Recent desktop-notification deduplication by organization and message id.
 *
 * Prevents duplicate OS toasts when the same message is delivered via long-poll and FCM.
 */
import { isMessageId } from "./message-id.lib";
import type { MessageId } from "./message-id.lib";

const MAX_RECENT_IDS = 200;
const recentIds: string[] = [];
const recentIdSet = new Set<string>();

function notificationIdentity(messageId: MessageId, instanceId: string | null): string {
  return `${instanceId ?? ""}:${messageId}`;
}

export function registerNotifiedMessageId(
  messageId: MessageId,
  instanceId: string | null = null,
): void {
  if (!isMessageId(messageId)) return;
  const identity = notificationIdentity(messageId, instanceId);
  if (recentIdSet.has(identity)) return;

  recentIds.push(identity);
  recentIdSet.add(identity);

  while (recentIds.length > MAX_RECENT_IDS) {
    const removed = recentIds.shift();
    if (removed != null) {
      recentIdSet.delete(removed);
    }
  }
}

export function wasRecentlyNotified(
  messageId: MessageId,
  instanceId: string | null = null,
): boolean {
  return recentIdSet.has(notificationIdentity(messageId, instanceId));
}

export function clearNotifiedMessageIds(): void {
  recentIds.length = 0;
  recentIdSet.clear();
}
