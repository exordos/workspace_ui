import type {
  WorkspaceRealtimeEventApplier,
  WorkspaceRealtimeRuntimeOwner,
} from "~/shared/lib/workspace-realtime/workspace-realtime-runtime.lib";
import { adaptWorkspaceMessengerUserDto } from "./user-adapters.lib";
import { useUsersStore } from "./user.model";

export interface UserRealtimeApplierOptions {
  isOwnerCurrent?: (owner: WorkspaceRealtimeRuntimeOwner) => boolean;
}

function isCurrentOwner(
  context: Parameters<WorkspaceRealtimeEventApplier["applyEvent"]>[1],
  options: UserRealtimeApplierOptions,
): boolean {
  if (context.surface !== "active") return false;
  if (context.signal?.aborted === true) return false;
  return options.isOwnerCurrent?.(context.owner) ?? true;
}

export function createUserRealtimeApplier(
  options: UserRealtimeApplierOptions = {},
): WorkspaceRealtimeEventApplier {
  return {
    applyEvent(event, context) {
      if (event.type !== "user") return;
      if (!isCurrentOwner(context, options)) return;

      useUsersStore
        .getState()
        .upsertUserForOwner(context.ownerKey, adaptWorkspaceMessengerUserDto(event.user));
    },
    skipEvent() {
      // User store does not keep realtime diagnostics; transport/messenger owns them.
    },
    onTransportStateChange() {
      // User store does not depend on socket transport state.
    },
  };
}
