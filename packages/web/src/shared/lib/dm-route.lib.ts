/**
 * DM route parsing helpers. Workspace DMs are 1:1 only: current user + one peer.
 */
import { numericUserIdOrNull, type UserId } from "~/shared/lib/user-id.lib";

export function normalizeDmRouteUserIds(
  userIds: readonly number[],
  currentUserId: UserId | null,
): number[] {
  const uniqueValidIds = Array.from(new Set(userIds)).filter(
    (userId) => Number.isSafeInteger(userId) && userId > 0,
  );
  const numericCurrentUserId = numericUserIdOrNull(currentUserId);
  if (numericCurrentUserId == null) {
    return uniqueValidIds;
  }
  const withoutCurrentUser = uniqueValidIds.filter((userId) => userId !== numericCurrentUserId);
  return withoutCurrentUser.length > 0 ? withoutCurrentUser : uniqueValidIds;
}

export function routeImpliesGroupDm(
  _dmRecipientIds: readonly number[],
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
  _slugUserIds: readonly number[],
  _currentUserId: UserId | null,
): boolean {
  return false;
}
