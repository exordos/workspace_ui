/**
 * DM route parsing helpers. Workspace DMs are 1:1 only: current user + one peer.
 */
import {
  isUserIdentityReady,
  type UserId,
  userIdsEqual,
  userIdStorageKey,
} from "~/shared/lib/user-id.lib";

export function normalizeDmRouteUserIds(
  userIds: readonly UserId[],
  currentUserId: UserId | null,
): UserId[] {
  const uniqueByKey = new Map<string, UserId>();
  for (const userId of userIds) {
    if (!isUserIdentityReady(userId)) continue;
    uniqueByKey.set(userIdStorageKey(userId), userId);
  }
  const uniqueValidIds = Array.from(uniqueByKey.values());
  if (currentUserId == null || !isUserIdentityReady(currentUserId)) {
    return uniqueValidIds;
  }
  const withoutCurrentUser = uniqueValidIds.filter(
    (userId) => !userIdsEqual(userId, currentUserId),
  );
  return withoutCurrentUser.length > 0 ? withoutCurrentUser : uniqueValidIds;
}

export function routeImpliesGroupDm(
  _dmRecipientIds: readonly UserId[],
  _currentUserId: UserId | null,
): boolean {
  return false;
}

export function computeIsGroupDmView(
  _dmChat: { isGroup?: boolean } | null | undefined,
  _dmRecipientIds: readonly UserId[],
  _currentUserId: UserId | null,
): boolean {
  return false;
}

export function effectiveDmIsGroupFromSlug(
  _isGroupFromRow: boolean | undefined,
  _slugUserIds: readonly UserId[],
  _currentUserId: UserId | null,
): boolean {
  return false;
}
