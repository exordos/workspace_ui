import { getCurrentInstance } from "~/shared/api/client";
import { numericUserIdOrNull, type UserId } from "~/shared/lib/user-id.lib";
import { putUserStatusCacheRow } from "~/shared/lib/user-status-cache-db";
import { useUsersStore, type UserStatus } from "../user.model";

/**
 * Applies an authoritative status snapshot to the users store and mirrors it
 * into the per-instance IDB cache used for cold-start hydration.
 */
export function applyUserStatusSnapshot(
  userId: UserId,
  status: UserStatus | null,
  fetchedAt = Date.now(),
  instanceId = getCurrentInstance()?.id,
): void {
  useUsersStore.getState().setStatus(userId, status, fetchedAt);
  const numericUserId = numericUserIdOrNull(userId);
  if (instanceId == null) {
    return;
  }
  if (numericUserId == null) {
    return;
  }
  void putUserStatusCacheRow({
    instanceId,
    userId: numericUserId,
    status,
    fetchedAt,
  });
}
