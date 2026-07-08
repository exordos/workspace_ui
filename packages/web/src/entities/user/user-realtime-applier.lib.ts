import type {
  WorkspaceRealtimeEventApplier,
  WorkspaceRealtimeRuntimeOwner,
} from "~/shared/lib/workspace-realtime/workspace-realtime-runtime.lib";
import { adaptWorkspaceMessengerUserDto } from "./user-adapters.lib";
import { writeUsersToCacheForOwner } from "./user-sync.lib";
import { useUsersStore } from "./user.model";
import type { UserCacheDeps } from "./user-sync.lib";

export interface UserRealtimeApplierOptions {
  isOwnerCurrent?: (owner: WorkspaceRealtimeRuntimeOwner) => boolean;
  userCache?: Pick<UserCacheDeps, "upsertUsersCache">;
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
      if (context.surface === "background") {
        // Для фонового surface не трогаем живой store: ему нужен только durable кэш для нотификаций.
        writeUsersToCacheForOwner(context.ownerKey, [user], options.userCache);
        return;
      }

      const applied = useUsersStore.getState().upsertUserForOwner(context.ownerKey, user);
      if (!applied) {
        return;
      }

      writeUsersToCacheForOwner(context.ownerKey, [user], options.userCache);
    },
    skipEvent() {
      // User store does not keep realtime diagnostics; transport/messenger owns them.
    },
    onTransportStateChange() {
      // User store does not depend on socket transport state.
    },
  };
}
