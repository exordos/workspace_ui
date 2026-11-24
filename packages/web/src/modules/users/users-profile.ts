import { buildWorkspaceRequestOptions } from "~/entities/workspace-auth/workspace-auth.lib";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import {
  isWorkspaceRuntimeRequestContextCurrent,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type { WorkspaceMessengerUserDto } from "~/shared/api/messenger.types";
import { getUser } from "~/shared/api/workspace-client";
import { adaptWorkspaceMessengerUserDto } from "./user-adapters.lib";
import { resolveCachedWorkspaceUser, writeUsersToCacheForOwner } from "./user-sync.lib";
import { getSelectedUsersStore } from "./user.model";
import type { User, UserUuid } from "./user.types";

// Read and update the selected user's manually chosen presence status.
export { readManualStatus } from "./user-manual-status.lib";
export { updateWorkspaceOwnStatus } from "./user-workspace-status-actions.lib";

const getRuntimeContext = () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext();

// Apply a confirmed own profile or avatar response to the selected catalog and its cache.
export function applyOwnUserProjection(
  dto: WorkspaceMessengerUserDto,
  runtimeContext: WorkspaceRuntimeContext,
  isCurrent: () => boolean,
): User | null {
  if (dto.uuid !== runtimeContext.userUuid) return null;

  const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
  const store = getSelectedUsersStore();
  const isWriteCurrent = () => {
    const selectedOwner = store.getState().ownerKey;
    return (
      isCurrent() &&
      isWorkspaceRuntimeRequestContextCurrent(runtimeContext, getRuntimeContext) &&
      getSelectedUsersStore() === store &&
      (selectedOwner == null || selectedOwner === ownerKey)
    );
  };
  if (!isWriteCurrent()) return null;

  const state = store.getState();
  const user = adaptWorkspaceMessengerUserDto(dto);
  if (state.ownerKey == null) state.upsertUser(user);
  else if (!state.upsertUserForOwner(ownerKey, user)) return null;
  if (isWriteCurrent()) writeUsersToCacheForOwner(ownerKey, [user], undefined, isWriteCurrent);
  return user;
}

// A profile link can prepare its selected owner even when catalog bootstrap is offline.
export function prepareSharedUserProfile(runtimeContext: WorkspaceRuntimeContext): boolean {
  if (!isWorkspaceRuntimeRequestContextCurrent(runtimeContext, getRuntimeContext)) return false;

  const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
  const state = getSelectedUsersStore().getState();
  if (state.ownerKey === ownerKey) return true;
  state.startOwnerSync(ownerKey);
  return false;
}

// Read the projection only while the selected owner and generation are current.
function readSharedUserProfileState(runtimeContext: WorkspaceRuntimeContext, ownerKey: string) {
  if (!isWorkspaceRuntimeRequestContextCurrent(runtimeContext, getRuntimeContext)) return null;
  const state = getSelectedUsersStore().getState();
  return state.ownerKey === ownerKey ? state : null;
}

// Restore one profile without marking the whole catalog ready or rewriting the cache.
export async function restoreSharedUserProfile(
  runtimeContext: WorkspaceRuntimeContext,
  userUuid: UserUuid,
  isCurrent: () => boolean,
): Promise<User | null> {
  const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
  const readCurrent = () =>
    isCurrent() ? readSharedUserProfileState(runtimeContext, ownerKey) : null;
  const initial = readCurrent();
  if (initial == null) return null;
  const existing = initial.usersById[userUuid];
  if (existing != null) return existing;

  const cached = await resolveCachedWorkspaceUser({ ownerKey, userUuid }).catch(() => null);
  const current = readCurrent();
  if (current == null) return null;
  const loaded = current.usersById[userUuid];
  if (loaded != null) return loaded;
  if (cached?.uuid !== userUuid) return null;
  return current.upsertUserForOwner(ownerKey, cached) ? cached : null;
}

// Refresh one linked profile independently of the catalog snapshot and loading status.
export async function refreshSharedUserProfile(
  runtimeContext: WorkspaceRuntimeContext,
  userUuid: UserUuid,
  signal: AbortSignal,
  isCurrent: () => boolean,
): Promise<boolean> {
  const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
  const readSelected = () =>
    signal.aborted ? null : readSharedUserProfileState(runtimeContext, ownerKey);
  const readCurrent = () => (isCurrent() ? readSelected() : null);
  if (readCurrent() == null) return false;

  const dto = await getUser(
    buildWorkspaceRequestOptions(runtimeContext, undefined, signal),
    userUuid,
  );
  const state = readCurrent();
  if (state == null) return false;
  if (dto.uuid !== userUuid)
    throw new Error("Shared profile response does not match the requested user");

  const user = adaptWorkspaceMessengerUserDto(dto);
  if (!state.upsertUserForOwner(ownerKey, user)) return false;
  if (readCurrent() == null) return false;
  // Completion consumes the link. A committed projection can still reach the cache for this session.
  writeUsersToCacheForOwner(ownerKey, [user], undefined, () => readSelected() != null);
  return true;
}
