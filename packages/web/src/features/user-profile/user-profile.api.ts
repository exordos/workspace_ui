/**
 * User profile API facade.
 *
 * The old Zulip user/status endpoints are intentionally not called during the
 * uuid-based user store cutover.
 */

import {
  getOwnAvatarCapabilities as getOwnAvatarCapabilitiesFromApi,
  removeOwnAvatar as removeOwnAvatarFromApi,
  uploadOwnAvatar as uploadOwnAvatarFromApi,
} from "~/shared/api/zulip-avatar-settings";
import { updateOwnProfileSettings } from "~/shared/api/zulip-profile-settings";
import { guard } from "~/shared/lib/guards";
import { createLogger } from "~/shared/lib/logger";
import type {
  OwnAvatarCapabilities,
  OwnAvatarMutationResult,
  OwnProfileUpdateResult,
  OwnStatusData,
  OwnStatusMutationResult,
  UserProfileData,
} from "./user-profile.types";

const log = createLogger("user-profile:api");

export {
  clearRealmProfileFieldsCache,
  fetchRealmProfileFieldDefinitionsWithSignal as fetchRealmProfileFieldDefinitions,
} from "~/shared/api/zulip-realm-profile-fields";

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

export async function updateOwnProfile(
  params: UpdateOwnProfileParams,
): Promise<OwnProfileUpdateResult> {
  const fullName = params.fullName.trim();
  const timezone = params.timezone.trim();
  guard.nonEmpty(fullName, "updateOwnProfile.fullName");
  guard.nonEmpty(timezone, "updateOwnProfile.timezone");

  const result = await updateOwnProfileSettings({
    fullName,
    timezone,
  });
  if (result.ok) {
    return { ok: true };
  }
  return {
    ok: false,
    kind: result.kind,
    message: result.message,
  };
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
  const capabilities = getOwnAvatarCapabilitiesFromApi();
  return {
    maxAvatarFileSizeMib: capabilities.maxAvatarFileSizeMib,
    avatarChangesDisabled: capabilities.avatarChangesDisabled,
  };
}

export async function uploadOwnAvatar(file: File): Promise<OwnAvatarMutationResult> {
  const result = await uploadOwnAvatarFromApi(file);
  if (result.ok) {
    return result;
  }
  return {
    ok: false,
    kind: result.kind,
    message: result.message,
  };
}

export async function removeOwnAvatar(): Promise<OwnAvatarMutationResult> {
  const result = await removeOwnAvatarFromApi();
  if (result.ok) {
    return result;
  }
  return {
    ok: false,
    kind: result.kind,
    message: result.message,
  };
}
