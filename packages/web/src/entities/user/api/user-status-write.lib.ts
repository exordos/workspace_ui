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
  instanceId = getCurrentInstance()?.id,
): void {
  useUsersStore.getState().setStatus(userId, status, fetchedAt);
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
