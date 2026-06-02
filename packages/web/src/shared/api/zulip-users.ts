/**
 * Zulip users and presence API.
 */
import { guard } from "~/shared/lib/guards";
import { parseCurrentUserFromApiData } from "./zulip-current-user.lib";
import { zulipPipelineGet } from "./zulip-pipeline.internal";
import { normalizeRealmEmojiMap } from "./zulip-realm-emoji.lib";
import type {
  AvatarUrlByUserId,
  RealmEmoji,
  RealmPresenceResponse,
  ZulipCurrentUser,
  ZulipUserMember,
} from "./zulip.types";

export async function getCurrentUser(): Promise<ZulipCurrentUser | null> {
  const res = await zulipPipelineGet("/users/me");
  if (!res?.ok) {
    return null;
  }
  return parseCurrentUserFromApiData(res.data);
}

/** Fetches the full user list (GET /users) for populating usersStore. */
export async function fetchUsers(): Promise<ZulipUserMember[]> {
  const res = await zulipPipelineGet("/users", {
    client_gravatar: "false",
    include_custom_profile_fields: "true",
  });
  if (!res?.ok) {
    return [];
  }
  const data = res.data as {
    result?: string;
    members?: ZulipUserMember[];
    users?: ZulipUserMember[];
  };
  if (data.result === "error") return [];
  if (Array.isArray(data.members)) {
    return data.members;
  }
  if (Array.isArray(data.users)) {
    return data.users;
  }
  return [];
}

/** Fetches a single user by ID (GET /users/{user_id}). Used for DM profile panel. */
export async function fetchUser(userId: number): Promise<ZulipUserMember | null> {
  guard.userId(userId, "fetchUser");
  const res = await zulipPipelineGet(`/users/${userId}`, {
    client_gravatar: "false",
    include_custom_profile_fields: "true",
  });
  if (!res?.ok) {
    return null;
  }
  const data = res.data as {
    result?: string;
    user?: ZulipUserMember;
  };
  if (data.result === "error" || !data.user?.user_id) return null;
  return data.user;
}

/** Fetches presence data for all users (GET /api/v1/realm/presence). */
export async function fetchRealmPresence(): Promise<RealmPresenceResponse> {
  const res = await zulipPipelineGet("/realm/presence");
  if (!res?.ok) {
    return { result: "error" };
  }
  return res.data as RealmPresenceResponse;
}

/** Fetches custom realm emoji in emoji-picker-react compatible shape (GET /realm/emoji). */
export async function fetchRealmEmojis(): Promise<RealmEmoji[]> {
  const res = await zulipPipelineGet("/realm/emoji");
  if (!res?.ok) {
    return [];
  }
  const data = res.data as {
    result?: string;
    emoji?: Record<
      string,
      { id?: string | number; name?: string; source_url?: string; deactivated?: boolean }
    >;
  };
  if (data.result === "error") {
    return [];
  }
  return normalizeRealmEmojiMap(data.emoji);
}

/**
 * Fetches users and returns a user_id → avatar_url map.
 * Prefer fetchUsers() + usersStore for caching; this is a convenience shortcut.
 */
export async function fetchUsersAvatarMap(): Promise<AvatarUrlByUserId> {
  const list = await fetchUsers();
  const map = new Map<number, string>();
  for (const u of list) {
    if (u.user_id != null && u.avatar_url != null && String(u.avatar_url).trim() !== "") {
      map.set(u.user_id, String(u.avatar_url).trim());
    }
  }
  return map;
}
