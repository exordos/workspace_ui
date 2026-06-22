import type { UserId } from "~/shared/lib/user-id.lib";
import { useUsersStore, type UserStatus } from "../user.model";

/** Applies a status snapshot to the in-memory users store. */
export function applyUserStatusSnapshot(
  userId: UserId,
  status: UserStatus | null,
  fetchedAt = Date.now(),
): void {
  useUsersStore.getState().setStatus(userId, status, fetchedAt);
}
