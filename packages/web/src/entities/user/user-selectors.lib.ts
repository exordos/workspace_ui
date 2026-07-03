import type { PresenceVisual } from "~/shared/ui/presence-indicator.types";
import type { User, UserPresenceStatus, UsersById, UserUuid } from "./user.types";

export function selectUserDisplayName(user: User | null | undefined, fallback = "Unknown"): string {
  const displayName = user?.displayName.trim() ?? "";
  if (displayName.length > 0) {
    return displayName;
  }
  const username = user?.username.trim() ?? "";
  return username.length > 0 ? username : fallback;
}

export function resolveUserPresenceVisual(
  status: UserPresenceStatus | null | undefined,
): PresenceVisual {
  if (status === "active") {
    return "active";
  }
  if (status === "idle" || status === "do_not_disturb") {
    return "idle";
  }
  if (status === "offline") {
    return "offline";
  }
  return null;
}

export function selectUsersByIds(usersById: UsersById, userIds: readonly UserUuid[]): User[] {
  return userIds
    .map((userUuid) => usersById[userUuid])
    .filter((user): user is User => user != null);
}

export function selectOnlineUserCount(usersById: UsersById, userIds: readonly UserUuid[]): number {
  return selectUsersByIds(usersById, userIds).reduce(
    (count, user) => count + (user.status === "active" ? 1 : 0),
    0,
  );
}
