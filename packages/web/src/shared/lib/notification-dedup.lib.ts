/**
 * Recent Workspace desktop-notification deduplication by owner + message UUID.
 */

const MAX_RECENT_KEYS = 200;
const recentKeys: string[] = [];
const recentKeySet = new Set<string>();

function normalizeRecentNotificationKey(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function pushRecentNotificationKey(key: string): void {
  if (recentKeySet.has(key)) return;

  recentKeys.push(key);
  recentKeySet.add(key);

  while (recentKeys.length > MAX_RECENT_KEYS) {
    const removed = recentKeys.shift();
    if (removed != null) {
      recentKeySet.delete(removed);
    }
  }
}

function hasRecentNotificationKey(key: string): boolean {
  return recentKeySet.has(key);
}

export function buildWorkspaceNotificationDedupKey(
  ownerKey: string | null | undefined,
  messageUuid: string | null | undefined,
): string | null {
  const normalizedOwnerKey = normalizeRecentNotificationKey(ownerKey);
  const normalizedMessageUuid = normalizeRecentNotificationKey(messageUuid);
  if (normalizedOwnerKey == null || normalizedMessageUuid == null) {
    return null;
  }
  return `${normalizedOwnerKey}::${normalizedMessageUuid}`;
}

export function registerNotifiedWorkspaceMessage(
  ownerKey: string | null | undefined,
  messageUuid: string | null | undefined,
): void {
  const dedupKey = buildWorkspaceNotificationDedupKey(ownerKey, messageUuid);
  if (dedupKey == null) {
    return;
  }

  pushRecentNotificationKey(dedupKey);
}

export function wasWorkspaceMessageRecentlyNotified(
  ownerKey: string | null | undefined,
  messageUuid: string | null | undefined,
): boolean {
  const dedupKey = buildWorkspaceNotificationDedupKey(ownerKey, messageUuid);
  return dedupKey == null ? false : hasRecentNotificationKey(dedupKey);
}

export function clearNotifiedMessageIds(): void {
  recentKeys.length = 0;
  recentKeySet.clear();
}
