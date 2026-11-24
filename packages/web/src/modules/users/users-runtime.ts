import { useUsersStore } from "./user.model";
import type { UserUuid } from "./user.types";

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
