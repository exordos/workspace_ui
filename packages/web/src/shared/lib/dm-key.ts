import {
  compareUserIds,
  numericUserIdOrNull,
  userIdStorageKey,
  type UserId,
} from "~/shared/lib/user-id.lib";

/** Canonical DM conversation key — sorted participant IDs as a comma-separated string. */
export function dmConversationKey(
  display_recipient: { id: number }[],
  currentUserId: UserId | null,
): string {
  const ids = display_recipient.map((r) => r.id);
  const numericCurrentUserId = numericUserIdOrNull(currentUserId);
  if (numericCurrentUserId != null && ids.length === 1 && ids[0] !== numericCurrentUserId) {
    return [numericCurrentUserId, ids[0]!].sort((a, b) => a - b).join(",");
  }
  return [...ids].sort((a, b) => a - b).join(",");
}

/** Canonical DM route key from URL participant ids. Keeps self-DM as a single user id. */
export function dmRouteKey(userIds: readonly UserId[], currentUserId: UserId | null): string {
  const byKey = new Map<string, UserId>();
  for (const userId of userIds) {
    byKey.set(userIdStorageKey(userId), userId);
  }
  if (currentUserId != null && !byKey.has(userIdStorageKey(currentUserId))) {
    byKey.set(userIdStorageKey(currentUserId), currentUserId);
  }
  return Array.from(byKey.values()).sort(compareUserIds).map(userIdStorageKey).join(",");
}
