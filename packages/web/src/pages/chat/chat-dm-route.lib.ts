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
