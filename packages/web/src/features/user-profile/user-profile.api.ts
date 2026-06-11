/**
 * User profile API — fetches detailed profile data from Zulip.
 *
 * Zulip API: GET /users/{user_id}
 */

import {
  fetchOwnStatus as fetchOwnStatusFromUsersApi,
  updateOwnStatus as updateOwnStatusFromUsersApi,
} from "~/entities/user/api/user.api";
import type { OwnStatusMutationResult } from "~/entities/user/api/user.api.types";
import { zulipApi } from "~/shared/api/client";
import {
  getOwnAvatarCapabilities as getOwnAvatarCapabilitiesFromApi,
  removeOwnAvatar as removeOwnAvatarFromApi,
  uploadOwnAvatar as uploadOwnAvatarFromApi,
} from "~/shared/api/zulip-avatar-settings";
import { updateOwnProfileSettings } from "~/shared/api/zulip-profile-settings";
import { fetchRealmProfileFieldDefinitions } from "~/shared/api/zulip-realm-profile-fields";
import { guard } from "~/shared/lib/guards";
import { createLogger } from "~/shared/lib/logger";
import { mapZulipProfileDataToSemanticFields } from "~/shared/lib/zulip-profile-fields-map.lib";
import type {
  OwnAvatarCapabilities,
  OwnAvatarMutationResult,
  OwnProfileUpdateResult,
  OwnStatusData,
  UserProfileData,
} from "./user-profile.types";

const log = createLogger("user-profile:api");

export {
  clearRealmProfileFieldsCache,
  fetchRealmProfileFieldDefinitions,
} from "~/shared/api/zulip-realm-profile-fields";

interface ZulipUserResponse {
  user: {
    user_id: number;
    full_name: string;
    email: string;
    avatar_url: string;
    role: number;
    is_bot?: boolean;
    is_active?: boolean; // Zulip JSON
    date_joined?: string;
    timezone?: string;
    profile_data?: Record<string, { value?: string; rendered_value?: string }>;
  };
}

export async function fetchUserProfile(userId: number): Promise<UserProfileData | null> {
  guard.userId(userId, "fetchUserProfile");

  try {
    const [res, realmFields] = await Promise.all([
      zulipApi.get(`/users/${userId}`, {
        client_gravatar: "false",
        include_custom_profile_fields: "true",
      }),
      fetchRealmProfileFieldDefinitions(),
    ]);

    if (!res.ok) {
      log.warn("Failed to fetch user profile", { userId, status: res.status });
      return null;
    }

    const data = res.data as ZulipUserResponse;
    const user = data.user;
    const profile = user.profile_data;

    const custom = mapZulipProfileDataToSemanticFields(profile, realmFields, {
      useLegacyFixedFieldIds: realmFields == null,
    });

    return {
      userId: user.user_id,
      fullName: user.full_name,
      email: user.email,
      avatarUrl: user.avatar_url,
      role: user.role,
      isBot: typeof user.is_bot === "boolean" ? user.is_bot : undefined,
      isActive: typeof user.is_active === "boolean" ? user.is_active : undefined,
      dateJoined:
        typeof user.date_joined === "string" && user.date_joined.trim().length > 0
          ? user.date_joined
          : undefined,
      timezone: user.timezone,
      jobTitle: custom.jobTitle,
      phone: custom.phone,
      manager: custom.manager,
      birthday: custom.birthday,
    };
  } catch (err) {
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

export async function updateOwnStatus(
  params: UpdateOwnStatusParams,
): Promise<OwnStatusMutationResult> {
  return updateOwnStatusFromUsersApi({
    text: params.statusText,
    away: params.away,
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
