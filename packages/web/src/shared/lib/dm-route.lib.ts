/**
 * DM route parsing helpers: normalize user ids from the URL vs current user, and infer whether
 * the active route is a Zulip huddle (3+ people) vs 1:1. Used by chat page and layout drawer.
 */

export function normalizeDmRouteUserIds(
  userIds: readonly number[],
  currentUserId: number | null,
): number[] {
  const uniqueValidIds = Array.from(new Set(userIds)).filter(
    (userId) => Number.isSafeInteger(userId) && userId > 0,
  );
  if (currentUserId == null) {
    return uniqueValidIds;
  }
  const withoutCurrentUser = uniqueValidIds.filter((userId) => userId !== currentUserId);
  return withoutCurrentUser.length > 0 ? withoutCurrentUser : uniqueValidIds;
}

/**
 * Zulip huddle: 3+ people. After `normalizeDmRouteUserIds`, 1:1 has exactly one "other" id when
 * `currentUserId` is known. Without `currentUserId`, a slug lists all participants — 1:1 has 2 ids,
 * huddle has 3+.
 */
export function routeImpliesGroupDm(
  dmRecipientIds: readonly number[],
  currentUserId: number | null,
): boolean {
  if (dmRecipientIds.length === 0) return false;
  if (currentUserId != null) {
    return dmRecipientIds.length > 1;
  }
  return dmRecipientIds.length > 2;
}

/**
 * Sidebar `isGroup` can disagree with the URL (stale row, folder fallback, or id mismatch). Trust
 * explicit `isGroup === false`; when `isGroup === true`, require the route to also imply a huddle.
 */
export function computeIsGroupDmView(
  dmChat: { isGroup?: boolean } | null | undefined,
  dmRecipientIds: readonly number[],
  currentUserId: number | null,
): boolean {
  const routeSaysGroup = routeImpliesGroupDm(dmRecipientIds, currentUserId);
  if (dmChat == null) {
    return routeSaysGroup;
  }
  if (dmChat.isGroup === false) {
    return false;
  }
  if (dmChat.isGroup === true) {
    return routeSaysGroup;
  }
  return routeSaysGroup;
}

/**
 * Sidebar / chat-list row: same reconciliation as the open chat, using raw user ids from the DM
 * slug (before `normalizeDmRouteUserIds`) plus optional API `isGroup`.
 */
export function effectiveDmIsGroupFromSlug(
  isGroupFromRow: boolean | undefined,
  slugUserIds: readonly number[],
  currentUserId: number | null,
): boolean {
  const normalized = normalizeDmRouteUserIds(slugUserIds, currentUserId);
  return computeIsGroupDmView({ isGroup: isGroupFromRow }, normalized, currentUserId);
}
