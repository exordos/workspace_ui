/**
 * User identity helpers — numeric messenger ids and IAM UUIDs share one `UserId` type.
 *
 * IAM directory rows use UUID strings as `user_id`. Messenger API payloads still use
 * positive integers. Store maps are keyed by `userIdStorageKey()` for stable lookup.
 */

/** Messenger numeric id or IAM user UUID. */
export type UserId = string | number;

const IAM_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isIamUserUuid(value: unknown): value is string {
  return typeof value === "string" && IAM_UUID_RE.test(value.trim());
}

export function isNumericUserId(value: UserId): value is number {
  return typeof value === "number";
}

export function numericUserIdOrNull(userId: UserId | null | undefined): number | null {
  return typeof userId === "number" ? userId : null;
}

/** Normalized map key for `useUsersStore.users`. */
export function userIdStorageKey(userId: UserId): string {
  if (typeof userId === "number") {
    return String(userId);
  }
  return userId.trim().toLowerCase();
}

export function userIdsEqual(left: UserId, right: UserId): boolean {
  if (typeof left !== typeof right) {
    return false;
  }
  return userIdStorageKey(left) === userIdStorageKey(right);
}

/** Sort order for mixed messenger numeric ids and IAM UUID strings. */
export function compareUserIds(left: UserId, right: UserId): number {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  return userIdStorageKey(left).localeCompare(userIdStorageKey(right));
}

/** True when chat actions can resolve the signed-in user (numeric id or IAM UUID). */
export function isUserIdentityReady(userId: UserId | null | undefined): boolean {
  if (userId == null) {
    return false;
  }
  if (typeof userId === "number") {
    return Number.isInteger(userId) && userId > 0;
  }
  return isIamUserUuid(userId);
}
