/**
 * Zulip users and presence API.
 */
import { guard } from "~/shared/lib/guards";
import { getRealmBaseUrl } from "./zulip-client.internal";
import { parseCurrentUserFromApiData } from "./zulip-current-user.lib";
import { zulipPipelineGet } from "./zulip-pipeline.internal";
import type {
  AvatarUrlByUserId,
  RealmEmoji,
  RealmPresenceResponse,
  ZulipCurrentUser,
  ZulipUserMember,
} from "./zulip.types";

function resolveRealmRelativeUrl(path: string): string {
  const normalizedPath = path.trim();
  if (!normalizedPath) {
    return "";
  }
  if (normalizedPath.startsWith("http://") || normalizedPath.startsWith("https://")) {
    return normalizedPath;
  }
  const base = getRealmBaseUrl();
  if (!base) {
    return "";
  }
  return `${base}${normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`}`;
}

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
  return Array.isArray(data.members) ? data.members : Array.isArray(data.users) ? data.users : [];
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
      {
        id?: string | number;
        name?: string;
        source_url?: string;
        deactivated?: boolean;
      }
    >;
  };
  if (data.result === "error") {
    return [];
  }
  if (data.emoji == null || typeof data.emoji !== "object" || Array.isArray(data.emoji)) {
    return [];
  }

  const normalized: RealmEmoji[] = [];
  for (const value of Object.values(data.emoji)) {
    if (typeof value !== "object" || value == null) {
      continue;
    }
    if (value.deactivated === true) {
      continue;
    }
    const id =
      typeof value.id === "string"
        ? value.id.trim()
        : typeof value.id === "number"
          ? String(value.id)
          : "";
    const name = typeof value.name === "string" ? value.name.trim() : "";
    const sourceUrl = typeof value.source_url === "string" ? value.source_url.trim() : "";
    if (!id || !name || !sourceUrl) {
      continue;
    }
    const imgUrl = resolveRealmRelativeUrl(sourceUrl);
    if (!imgUrl) {
      continue;
    }
    normalized.push({
      id,
      names: [name],
      imgUrl,
    });
  }
  return normalized;
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
