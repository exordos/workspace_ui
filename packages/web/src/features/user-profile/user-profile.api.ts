/**
 * User profile API — fetches detailed profile data from Zulip.
 *
 * Zulip API: GET /users/{user_id}
 */

import { zulipApi } from "~/shared/api/client";
import { guard } from "~/shared/lib/guards";
import { createLogger } from "~/shared/lib/logger";
import type { OwnStatusData, UserProfileData } from "./user-profile.types";

const log = createLogger("user-profile:api");

interface ZulipUserResponse {
  user: {
    user_id: number;
    full_name: string;
    email: string;
    avatar_url: string;
    role: number;
    is_bot?: boolean;
    is_active?: boolean;
    date_joined?: string;
    timezone?: string;
    profile_data?: Record<string, { value?: string; rendered_value?: string }>;
  };
}

interface OwnStatusResponse {
  result?: string;
  status_text?: string;
  away?: boolean | string;
}

function extractCustomField(
  profileData: ZulipUserResponse["user"]["profile_data"],
  fieldId: string,
): string | undefined {
  const value = profileData?.[fieldId]?.value;
  return value != null && value.length > 0 ? value : undefined;
}

export async function fetchUserProfile(userId: number): Promise<UserProfileData | null> {
  guard.userId(userId, "fetchUserProfile");

  try {
    const res = await zulipApi.get(`/users/${userId}`);

    if (!res.ok) {
      log.warn("Failed to fetch user profile", { userId, status: res.status });
      return null;
    }

    const data = res.data as ZulipUserResponse;
    const user = data.user;
    const profile = user.profile_data;

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
      jobTitle: extractCustomField(profile, "1"),
      phone: extractCustomField(profile, "2"),
      manager: extractCustomField(profile, "3"),
      birthday: extractCustomField(profile, "4"),
    };
  } catch (err) {
    log.error("Error fetching user profile", { userId, error: String(err) });
    return null;
  }
}

function parseAwayFlag(value: OwnStatusResponse["away"]): boolean {
  if (value === true) return true;
  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }
  return false;
}

export async function fetchOwnStatus(): Promise<OwnStatusData | null> {
  try {
    const res = await zulipApi.get("/users/me/status");
    if (!res.ok) {
      log.warn("Failed to fetch own status", { status: res.status });
      return null;
    }
    const data = res.data as OwnStatusResponse;
    if (data.result === "error") {
      return null;
    }
    return {
      statusText: typeof data.status_text === "string" ? data.status_text : "",
      away: parseAwayFlag(data.away),
    };
  } catch (err) {
    log.error("Error fetching own status", { error: String(err) });
    return null;
  }
}

export interface UpdateOwnProfileParams {
  fullName: string;
}

export async function updateOwnProfile(params: UpdateOwnProfileParams): Promise<boolean> {
  const fullName = params.fullName.trim();
  guard.nonEmpty(fullName, "updateOwnProfile.fullName");

  try {
    const res = await zulipApi.patch("/settings", {
      full_name: fullName,
    });
    if (!res.ok) {
      log.warn("Failed to update own profile", { status: res.status });
      return false;
    }
    return true;
  } catch (err) {
    log.error("Error updating own profile", { error: String(err) });
    return false;
  }
}

export interface UpdateOwnStatusParams {
  statusText: string;
  away: boolean;
}

export async function updateOwnStatus(params: UpdateOwnStatusParams): Promise<boolean> {
  const statusText = params.statusText.trim();
  try {
    const res = await zulipApi.post("/users/me/status", {
      status_text: statusText,
      away: params.away ? "true" : "false",
    });
    if (!res.ok) {
      log.warn("Failed to update own status", { status: res.status });
      return false;
    }
    return true;
  } catch (err) {
    log.error("Error updating own status", { error: String(err) });
    return false;
  }
}
