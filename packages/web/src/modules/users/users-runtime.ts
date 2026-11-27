import { deleteWorkspaceUserOwnerCache } from "~/shared/lib/workspace-user-cache-db";
import { useUsersStore } from "./user.model";
import type { UserUuid } from "./user.types";

// Remove durable profiles for a revoked session while the auth owner guard is current.
export async function cleanupUsersSession(
  ownerKey: string,
  isWriteCurrent: () => boolean,
): Promise<void> {
  await deleteWorkspaceUserOwnerCache(ownerKey, isWriteCurrent);
}

export { workspaceStatusDecoration } from "./user-presence-status.lib";
export { createUserRealtimeApplier } from "./user-realtime-applier.lib";
export {
  refreshWorkspaceSessionUsers,
  resolveCachedWorkspaceUser,
  restoreWorkspaceSessionUsers,
} from "./user-sync.lib";
export { startWorkspacePresenceReporter } from "./user-workspace-presence-reporter.lib";
export { reconcileUsersStores as reconcileUsersSessions } from "./user.model";

// Subscribe to profile readiness for the selected owner without tracking profile edits.
export function useHasUserForOwner(
  userUuid: UserUuid | undefined,
  ownerKey: string | null,
): boolean {
  return useUsersStore(
    (state) => userUuid != null && state.ownerKey === ownerKey && state.usersById[userUuid] != null,
  );
}
