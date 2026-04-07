/**
 * Zulip users and presence API.
 */
import { guard } from "~/shared/lib/guards";
import { zulipPipelineGet } from "./zulip-pipeline.internal";
import type {
  AvatarUrlByUserId,
  RealmPresenceResponse,
  ZulipCurrentUser,
  ZulipUserMember,
} from "./zulip.types";

export async function getCurrentUser(): Promise<ZulipCurrentUser | null> {
  const res = await zulipPipelineGet("/users/me");
  if (!res?.ok) {
    return null;
  }
  const data = res.data as {
    result?: string;
    user_id?: number;
    full_name?: string;
    email?: string;
  };
  if (data.result === "error" || data.user_id == null) return null;
  return {
    user_id: data.user_id,
    full_name: data.full_name ?? "",
    email: data.email ?? "",
  };
}

/** Fetches the full user list (GET /users) for populating usersStore. */
export async function fetchUsers(): Promise<ZulipUserMember[]> {
  const res = await zulipPipelineGet("/users", { client_gravatar: "false" });
  if (!res?.ok) {
    return [];
  }
  const data = res.data as {
    result?: string;
    members?: ZulipUserMember[];
    users?: ZulipUserMember[];
  };
  if (data.result === "error") return [];
  return Array.isArray(data.members) ? data.members : Array.isArray(data.users) ? data.users : [];
}

/** Fetches a single user by ID (GET /users/{user_id}). Used for DM profile panel. */
export async function fetchUser(userId: number): Promise<ZulipUserMember | null> {
  guard.userId(userId, "fetchUser");
  const res = await zulipPipelineGet(`/users/${userId}`, { client_gravatar: "false" });
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
