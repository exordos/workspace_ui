/**
 * User profile API facade.
 *
 * The old Zulip user/status endpoints are intentionally not called during the
 * uuid-based user store cutover.
 */

import { buildWorkspaceRequestOptions } from "~/entities/messenger/messenger-request-options.lib";
import { adaptWorkspaceMessengerUserDto } from "~/entities/user/user-adapters.lib";
import { writeUsersToCacheForOwner } from "~/entities/user/user-sync.lib";
import { useUsersStore } from "~/entities/user/user.model";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import {
  captureWorkspaceRuntimeRequestContext,
  isWorkspaceRuntimeRequestInvalidated,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { MessengerApiError } from "~/shared/api/messenger-transport.internal";
import type { WorkspaceMessengerUserDto } from "~/shared/api/messenger.types";
import {
  resetUserAvatar as resetWorkspaceUserAvatar,
  uploadUserAvatar as uploadWorkspaceUserAvatar,
} from "~/shared/api/workspace-client";
import { guard } from "~/shared/lib/guards";
import { createLogger } from "~/shared/lib/logger";
import type { RealmProfileFieldDefinition } from "~/shared/lib/zulip-profile-fields-map.lib";
import type {
  OwnAvatarCapabilities,
  OwnAvatarMutationResult,
  OwnProfileUpdateResult,
  OwnStatusData,
  OwnStatusMutationResult,
  UserProfileData,
} from "./user-profile.types";

const log = createLogger("user-profile:api");
const UNSUPPORTED_PROFILE_MESSAGE =
  "Profile updates are read-only until Workspace profile write API is available";
const WORKSPACE_MAX_AVATAR_FILE_SIZE_MIB = 25;
const STALE_AVATAR_MUTATION_MESSAGE = "Avatar response belongs to an inactive Workspace session";

export function clearRealmProfileFieldsCache(): void {
  // Kept as a no-op for callers that clear all profile-side caches after logout.
}

export function fetchRealmProfileFieldDefinitions(
  signal?: AbortSignal,
): Promise<RealmProfileFieldDefinition[] | null> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }
  log.info("Realm profile fields are unsupported in Workspace profile API");
  return Promise.resolve(null);
}

export function fetchUserProfile(
  userId: number,
  options?: { signal?: AbortSignal },
): Promise<UserProfileData | null> {
  guard.userId(userId, "fetchUserProfile");
  if (options?.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  log.info("User profile fetch skipped during user store cutover", { userId });
  return Promise.resolve(null);
}

export function fetchOwnStatus(): Promise<OwnStatusData | null> {
  return Promise.resolve(null);
}

export interface UpdateOwnProfileParams {
  fullName: string;
  timezone: string;
}

export function updateOwnProfile(params: UpdateOwnProfileParams): Promise<OwnProfileUpdateResult> {
  const fullName = params.fullName.trim();
  const timezone = params.timezone.trim();
  guard.nonEmpty(fullName, "updateOwnProfile.fullName");
  guard.nonEmpty(timezone, "updateOwnProfile.timezone");

  return Promise.resolve({
    ok: false,
    kind: "unsupported",
    message: UNSUPPORTED_PROFILE_MESSAGE,
  });
}

export interface UpdateOwnStatusParams {
  statusText: string;
  away: boolean;
}

export function updateOwnStatus(_params: UpdateOwnStatusParams): Promise<OwnStatusMutationResult> {
  return Promise.resolve({
    ok: false,
    kind: "unsupported",
    message: "status updates are not supported during user store cutover",
  });
}

export function getOwnAvatarCapabilities(): OwnAvatarCapabilities {
  return {
    maxAvatarFileSizeMib: WORKSPACE_MAX_AVATAR_FILE_SIZE_MIB,
    avatarChangesDisabled: false,
  };
}

function getCurrentRuntimeContext(): WorkspaceRuntimeContext | null {
  return selectCurrentWorkspaceRuntimeContext(useWorkspaceAuthStore.getState());
}

function classifyAvatarMutationError(error: unknown): OwnAvatarMutationResult {
  if (error instanceof MessengerApiError) {
    if (error.status === 401 || error.status === 403) {
      return { ok: false, kind: "forbidden", message: error.message };
    }
    if ([400, 413, 415, 422].includes(error.status)) {
      return { ok: false, kind: "invalid", message: error.message };
    }
    if ([404, 405, 501].includes(error.status)) {
      return { ok: false, kind: "unsupported", message: error.message };
    }
  }

  return {
    ok: false,
    kind: "transient",
    message: error instanceof Error ? error.message : "Workspace avatar update failed",
  };
}

function applyOwnAvatarResponse(
  runtimeContext: WorkspaceRuntimeContext,
  userDto: WorkspaceMessengerUserDto,
): OwnAvatarMutationResult {
  const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
  const user = adaptWorkspaceMessengerUserDto(userDto);
  const state = useUsersStore.getState();
  let applied = true;
  if (state.ownerKey == null) {
    state.upsertUser(user);
  } else {
    applied = state.upsertUserForOwner(ownerKey, user);
  }

  if (!applied) {
    return {
      ok: false,
      kind: "transient",
      message: STALE_AVATAR_MUTATION_MESSAGE,
    };
  }

  writeUsersToCacheForOwner(ownerKey, [user]);
  return { ok: true, avatarUrl: user.avatarUrl };
}

async function mutateOwnAvatar(
  runtimeContext: WorkspaceRuntimeContext,
  signal: AbortSignal | undefined,
  request: (
    options: ReturnType<typeof buildWorkspaceRequestOptions>,
    userUuid: string,
  ) => Promise<WorkspaceMessengerUserDto>,
): Promise<OwnAvatarMutationResult> {
  const requestContext = captureWorkspaceRuntimeRequestContext(() => runtimeContext);

  try {
    const userDto = await request(
      buildWorkspaceRequestOptions(runtimeContext, undefined, signal),
      runtimeContext.userUuid,
    );
    if (isWorkspaceRuntimeRequestInvalidated(requestContext, getCurrentRuntimeContext, signal)) {
      return {
        ok: false,
        kind: "transient",
        message: STALE_AVATAR_MUTATION_MESSAGE,
      };
    }
    return applyOwnAvatarResponse(runtimeContext, userDto);
  } catch (error) {
    if (signal?.aborted !== true) {
      log.warn("Workspace avatar mutation failed", {
        status: error instanceof MessengerApiError ? error.status : undefined,
      });
    }
    return classifyAvatarMutationError(error);
  }
}

export function uploadOwnAvatar(
  runtimeContext: WorkspaceRuntimeContext,
  file: File,
  signal?: AbortSignal,
): Promise<OwnAvatarMutationResult> {
  return mutateOwnAvatar(runtimeContext, signal, (options, userUuid) =>
    uploadWorkspaceUserAvatar(options, userUuid, file),
  );
}

export function removeOwnAvatar(
  runtimeContext: WorkspaceRuntimeContext,
  signal?: AbortSignal,
): Promise<OwnAvatarMutationResult> {
  return mutateOwnAvatar(runtimeContext, signal, resetWorkspaceUserAvatar);
}
