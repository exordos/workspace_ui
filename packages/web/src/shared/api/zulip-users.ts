/**
 * Legacy Zulip users API facade.
 */
import { guard } from "~/shared/lib/guards";
import type { AvatarUrlByUserId, ZulipCurrentUser, ZulipUserMember } from "./zulip.types";

export function getCurrentUser(): Promise<ZulipCurrentUser | null> {
  return Promise.resolve(null);
}

/** Legacy GET /users is intentionally disabled after the Workspace API cutover. */
export function fetchUsers(): Promise<ZulipUserMember[]> {
  return Promise.resolve([]);
}

/** Legacy GET /users/{user_id} is intentionally disabled after the Workspace API cutover. */
export function fetchUser(
  userId: number,
  _options?: { signal?: AbortSignal },
): Promise<ZulipUserMember | null> {
  guard.userId(userId, "fetchUser");
  return Promise.resolve(null);
}

/**
 * Legacy avatar map loading is intentionally disabled after the Workspace API cutover.
 */
export function fetchUsersAvatarMap(): Promise<AvatarUrlByUserId> {
  return Promise.resolve(new Map<number, string>());
}
