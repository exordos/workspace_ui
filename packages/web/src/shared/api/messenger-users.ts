/**
 * Workspace users and presence API.
 */
import { resolveUserUuidFromAccessToken } from "~/shared/lib/access-token-claims.lib";
import { resolveIamAccessToken } from "~/shared/lib/iam-instance.lib";
import type { UserId } from "~/shared/lib/user-id.lib";
import { isIamUserUuid, userIdStorageKey } from "~/shared/lib/user-id.lib";
import {
  getCurrentInstance,
  getWorkspaceCommonApiBaseForCurrentInstance,
  messengerApi,
} from "./client";
import { parseMessengerGatewayUser, parseMessengerGatewayUserList } from "./messenger-users.lib";
import type {
  AvatarUrlByUserId,
  RealmEmoji,
  WorkspaceCurrentUser,
  MessengerUserMember,
} from "./messenger.types";

export async function getCurrentUser(): Promise<WorkspaceCurrentUser | null> {
  const instance = getCurrentInstance();
  if (instance == null) {
    return null;
  }
  const userUuid = resolveUserUuidFromAccessToken(resolveIamAccessToken(instance));
  if (userUuid == null) {
    return null;
  }
  const user = await fetchUser(userUuid);
  if (user == null) {
    return null;
  }
  return {
    user_id: user.user_id,
    full_name: user.full_name ?? "",
    email: user.email ?? "",
  };
}

/** Resolves the authenticated IAM principal without an extra user request. */
export function getCurrentUserIdFromAccessToken(): UserId | null {
  const instance = getCurrentInstance();
  if (instance == null) {
    return null;
  }
  return resolveUserUuidFromAccessToken(resolveIamAccessToken(instance));
}

/** Fetches the full user list for populating usersStore. */
export async function fetchUsers(): Promise<MessengerUserMember[]> {
  try {
    const res = await messengerApi.getWithBase(
      getWorkspaceCommonApiBaseForCurrentInstance(),
      "/users/",
    );
    if (!res.ok) {
      return [];
    }
    return parseMessengerGatewayUserList(res.data);
  } catch {
    return [];
  }
}

/** Fetches a single user by UUID from the Workspace gateway backend. */
export async function fetchUser(
  userId: UserId,
  options?: { signal?: AbortSignal },
): Promise<MessengerUserMember | null> {
  if (!isIamUserUuid(userId)) {
    return null;
  }
  const userUuid = userId.trim().toLowerCase();
  try {
    const res = await messengerApi.getWithBase(
      getWorkspaceCommonApiBaseForCurrentInstance(),
      "/users/" + userUuid,
      undefined,
      options?.signal,
    );
    if (!res.ok) {
      return null;
    }
    return parseMessengerGatewayUser(res.data);
  } catch {
    return null;
  }
}

/** The current backend does not expose custom realm emoji metadata. */
export function fetchRealmEmojis(): Promise<RealmEmoji[]> {
  return Promise.resolve([]);
}

/**
 * Fetches users and returns a user_id → avatar_url map.
 * Prefer fetchUsers() + usersStore for caching; this is a convenience shortcut.
 */
export async function fetchUsersAvatarMap(): Promise<AvatarUrlByUserId> {
  const list = await fetchUsers();
  const map = new Map<string, string>();
  for (const u of list) {
    if (u.user_id != null && u.avatar_url != null && String(u.avatar_url).trim() !== "") {
      map.set(userIdStorageKey(u.user_id), String(u.avatar_url).trim());
    }
  }
  return map;
}
