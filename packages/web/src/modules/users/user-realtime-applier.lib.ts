import { WorkspaceRealtimeParticipantNotReadyError } from "~/platform/realtime/workspace-realtime-applier.lib";
import type {
  WorkspaceRealtimeEventApplier,
  WorkspaceRealtimeRuntimeOwner,
} from "~/platform/realtime/workspace-realtime-runtime.lib";
import { adaptWorkspaceMessengerUserDto } from "./user-adapters.lib";
import { writeUsersToCacheForOwner } from "./user-sync.lib";
import { getSelectedUsersStore, getUsersStoreForOwner } from "./user.model";
import type { UserCacheDeps } from "./user-sync.lib";

export interface UserRealtimeApplierOptions {
  isOwnerCurrent?: (owner: WorkspaceRealtimeRuntimeOwner) => boolean;
  userCache?: Pick<UserCacheDeps, "upsertUsersCache">;
  requireActiveProjection?: boolean; // The session cursor waits if the selected users store is unavailable.
}

function canWriteUserCache(
  context: Parameters<WorkspaceRealtimeEventApplier["applyEvent"]>[1],
  options: UserRealtimeApplierOptions,
): boolean {
  if (context.signal?.aborted === true) return false;
  return options.isOwnerCurrent?.(context.owner) ?? true;
}

export function createUserRealtimeApplier(
  options: UserRealtimeApplierOptions = {},
): WorkspaceRealtimeEventApplier {
  return {
    applyEvent(event, context) {
      if (event.type !== "user") return;
      if (!canWriteUserCache(context, options)) return;

      const user = adaptWorkspaceMessengerUserDto(event.user);
      const store =
        getUsersStoreForOwner(context.ownerKey) ??
        (context.surface === "active" ? getSelectedUsersStore() : null);
      if (store?.getState().upsertUserForOwner(context.ownerKey, user) !== true) {
        if (options.requireActiveProjection === true) {
          throw new WorkspaceRealtimeParticipantNotReadyError("users");
        }
        if (context.surface === "active") return;
      }

      writeUsersToCacheForOwner(context.ownerKey, [user], options.userCache, () =>
        canWriteUserCache(context, options),
      );
    },
    skipEvent() {
      // User store does not keep realtime diagnostics; transport/messenger owns them.
    },
    onTransportStateChange() {
      // User store does not depend on socket transport state.
    },
  };
}
