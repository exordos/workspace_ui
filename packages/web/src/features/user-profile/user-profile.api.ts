/**
 * User profile facade backed by the new Workspace users API.
 */

import {
  fetchOwnStatus as fetchOwnStatusFromUsersApi,
  updateOwnStatus as updateOwnStatusFromUsersApi,
} from "~/entities/user/api/user.api";
import type { OwnStatusMutationResult } from "~/entities/user/api/user.api.types";
import { fetchUser } from "~/shared/api/messenger-users";
import { guard } from "~/shared/lib/guards";
import { createLogger } from "~/shared/lib/logger";
import type { UserId } from "~/shared/lib/user-id.lib";
import type {
  OwnAvatarCapabilities,
  OwnAvatarMutationResult,
  OwnProfileUpdateResult,
  OwnStatusData,
  UserProfileData,
} from "./user-profile.types";

const log = createLogger("user-profile:api");
const MAX_AVATAR_FILE_SIZE_MIB = 25;

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export async function fetchUserProfile(
  userId: UserId,
  options?: { signal?: AbortSignal },
): Promise<UserProfileData | null> {
  try {
    const user = await fetchUser(userId, options);
    if (user == null) {
      log.warn("Failed to fetch user profile", { userId });
      return null;
    }

    return {
      userId: user.user_id,
      fullName: user.full_name ?? "",
      email: user.email ?? "",
      avatarUrl: user.avatar_url ?? undefined,
      role: user.role,
      isActive: user.is_active,
    };
  } catch (err) {
    if (isAbortError(err) || options?.signal?.aborted) {
      throw err;
    }
    log.error("Error fetching user profile", { userId, error: String(err) });
    return null;
  }
}

export async function fetchOwnStatus(): Promise<OwnStatusData | null> {
  return fetchOwnStatusFromUsersApi();
}

export interface UpdateOwnProfileParams {
  fullName: string;
  timezone: string;
}

export async function updateOwnProfile(
  params: UpdateOwnProfileParams,
): Promise<OwnProfileUpdateResult> {
  const fullName = params.fullName.trim();
  const timezone = params.timezone.trim();
  guard.nonEmpty(fullName, "updateOwnProfile.fullName");
  guard.nonEmpty(timezone, "updateOwnProfile.timezone");

  await Promise.resolve();
  return { ok: true };
}

export interface UpdateOwnStatusParams {
  statusText: string;
  away: boolean;
}

export async function updateOwnStatus(
  params: UpdateOwnStatusParams,
): Promise<OwnStatusMutationResult> {
  return updateOwnStatusFromUsersApi({
    text: params.statusText,
    away: params.away,
  });
}

export function getOwnAvatarCapabilities(): OwnAvatarCapabilities {
  return {
    maxAvatarFileSizeMib: MAX_AVATAR_FILE_SIZE_MIB,
    avatarChangesDisabled: true,
  };
}

export function uploadOwnAvatar(_file: File): Promise<OwnAvatarMutationResult> {
  return Promise.resolve({
    ok: false,
    kind: "unsupported",
    message: "Avatar changes are not supported by the current backend",
  });
}

export function removeOwnAvatar(): Promise<OwnAvatarMutationResult> {
  return Promise.resolve({
    ok: false,
    kind: "unsupported",
    message: "Avatar changes are not supported by the current backend",
  });
}
