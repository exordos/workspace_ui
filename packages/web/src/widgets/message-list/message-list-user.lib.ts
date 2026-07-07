import {
  resolveUserPresenceVisual,
  selectUserDisplayName,
  selectUserStatusLabel,
} from "~/entities/user/user-selectors.lib";
import type { User, UsersById, UserUuid } from "~/entities/user/user.types";
import type { PresenceVisual } from "~/shared/ui/presence-indicator.types";

function normalizeDisplayName(value: string): string {
  return value.replace(/^@/, "").trim().toLowerCase();
}

export interface MessageSenderIdentity {
  sender_id?: number;
  authorUuid?: UserUuid;
}

export function resolveMessageSenderUser(
  usersById: UsersById,
  message: MessageSenderIdentity,
): User | undefined {
  if (message.authorUuid != null) {
    return usersById[message.authorUuid];
  }
  if (message.sender_id == null) {
    return undefined;
  }
  return usersById[String(message.sender_id)];
}

export function resolveMessageSenderDisplayName(user: User | undefined, fallback: string): string {
  return selectUserDisplayName(user, fallback);
}

export function resolveMessageSenderPresence(user: User | undefined): PresenceVisual {
  return resolveUserPresenceVisual(user?.status);
}

function resolveNumericUserId(user: User): number | null {
  const legacyId = (user as { user_id?: unknown }).user_id;
  if (typeof legacyId === "number" && Number.isSafeInteger(legacyId) && legacyId > 0) {
    return legacyId;
  }

  return null;
}

export function resolveMentionUserId(usersById: UsersById, displayName: string): number | null {
  const needle = normalizeDisplayName(displayName);
  if (needle.length === 0) {
    return null;
  }

  for (const user of Object.values(usersById)) {
    if (normalizeDisplayName(user.displayName) === needle) {
      return resolveNumericUserId(user);
    }
  }

  return null;
}

export function resolveMentionUserUuid(usersById: UsersById, displayName: string): UserUuid | null {
  const needle = normalizeDisplayName(displayName);
  if (needle.length === 0) {
    return null;
  }

  for (const user of Object.values(usersById)) {
    if (normalizeDisplayName(user.displayName) === needle) {
      return user.uuid;
    }
  }

  return null;
}

export function resolveCustomStatusLabel(user: User | undefined): string | null {
  return selectUserStatusLabel(user);
}
