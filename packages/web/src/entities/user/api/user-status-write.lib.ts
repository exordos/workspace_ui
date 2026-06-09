import { getCurrentInstance } from "~/shared/api/client";
import { putUserStatusCacheRow } from "~/shared/lib/user-status-cache-db";
import { useUsersStore, type UserStatus } from "../user.model";

/**
 * Applies an authoritative status snapshot to the users store and mirrors it
 * into the per-instance IDB cache used for cold-start hydration.
 */
export function applyUserStatusSnapshot(
  userId: number,
  status: UserStatus | null,
  fetchedAt = Date.now(),
): void {
  useUsersStore.getState().setStatus(userId, status, fetchedAt);
  const instanceId = getCurrentInstance()?.id;
  if (instanceId == null) {
    return;
  }
  void putUserStatusCacheRow({
    instanceId,
    userId,
    status,
    fetchedAt,
  });
}
