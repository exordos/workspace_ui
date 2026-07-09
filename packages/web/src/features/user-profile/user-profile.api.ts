/**
 * User profile API facade.
 *
 * The old Zulip user/status endpoints are intentionally not called during the
 * uuid-based user store cutover.
 */

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
const UNSUPPORTED_AVATAR_MESSAGE =
  "Avatar changes are read-only until Workspace avatar API is available";
const FALLBACK_MAX_AVATAR_FILE_SIZE_MIB = 25;

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
    maxAvatarFileSizeMib: FALLBACK_MAX_AVATAR_FILE_SIZE_MIB,
    avatarChangesDisabled: true,
  };
}

export function uploadOwnAvatar(_file: File): Promise<OwnAvatarMutationResult> {
  return Promise.resolve({
    ok: false,
    kind: "unsupported",
    message: UNSUPPORTED_AVATAR_MESSAGE,
  });
}

export function removeOwnAvatar(): Promise<OwnAvatarMutationResult> {
  return Promise.resolve({
    ok: false,
    kind: "unsupported",
    message: UNSUPPORTED_AVATAR_MESSAGE,
  });
}
