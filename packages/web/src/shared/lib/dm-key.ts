/** Canonical DM conversation key — sorted participant IDs as a comma-separated string. */
export function dmConversationKey(
  display_recipient: { id: number }[],
  currentUserId: number | null,
): string {
  const ids = display_recipient.map((r) => r.id);
  if (currentUserId != null && ids.length === 1 && ids[0] !== currentUserId) {
    return [currentUserId, ids[0]!].sort((a, b) => a - b).join(",");
  }
  return [...ids].sort((a, b) => a - b).join(",");
}

/** Canonical DM route key from URL participant ids. Keeps self-DM as a single user id. */
export function dmRouteKey(userIds: number[], currentUserId: number | null): string {
  const uniqueIds = Array.from(new Set(userIds)).sort((a, b) => a - b);
  if (currentUserId != null && !uniqueIds.includes(currentUserId)) {
    return [...uniqueIds, currentUserId].sort((a, b) => a - b).join(",");
  }
  return uniqueIds.join(",");
}
