import type { MessengerUserMember } from "~/shared/api/messenger.types";
import type { UserId } from "~/shared/lib/user-id.lib";
import { userIdStorageKey } from "~/shared/lib/user-id.lib";

const STORAGE_PREFIX = "workspace-user-status-away:v1";

function storageKey(instanceId: string | null | undefined, userId: UserId): string {
  const trimmedInstanceId = instanceId?.trim();
  const scope =
    trimmedInstanceId != null && trimmedInstanceId.length > 0 ? trimmedInstanceId : "global";
  return `${STORAGE_PREFIX}:${scope}:${userIdStorageKey(userId)}`;
}

export function readUserStatusAwayPreference(
  userId: UserId,
  instanceId?: string | null,
): boolean | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const value = window.localStorage.getItem(storageKey(instanceId, userId));
    if (value === "1") {
      return true;
    }
    if (value === "0") {
      return false;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeUserStatusAwayPreference(
  userId: UserId,
  instanceId: string | null | undefined,
  away: boolean,
): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(storageKey(instanceId, userId), away ? "1" : "0");
  } catch {
    /* localStorage may be unavailable */
  }
}

export function removeUserStatusAwayPreference(userId: UserId, instanceId?: string | null): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(storageKey(instanceId, userId));
  } catch {
    /* localStorage may be unavailable */
  }
}

export function applyUserStatusAwayPreference(
  user: MessengerUserMember,
  currentUserId: UserId,
  instanceId?: string | null,
): MessengerUserMember {
  const awayPreference = readUserStatusAwayPreference(currentUserId, instanceId);
  if (awayPreference == null) {
    return user;
  }
  if (user.status == null && !awayPreference) {
    return user;
  }
  const currentStatus = user.status ?? { text: "", away: true };
  return {
    ...user,
    status: {
      ...currentStatus,
      away: awayPreference,
    },
  };
}
