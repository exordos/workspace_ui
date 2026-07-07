import type { PresenceVisual } from "~/shared/ui/presence-indicator.types";
import type { User, UserPresenceStatus, UsersById, UserUuid } from "./user.types";

const LEGACY_STATUS_EMOJI_SYMBOLS: Record<string, string> = {
  speech_balloon: "💬",
  house: "🏠",
  palm_tree: "🌴",
  plate_with_cutlery: "🍽️",
  helmet_with_white_cross: "⛑️",
  spiral_calendar_pad: "🗓️",
};

const SHORTCODE_LIKE_STATUS_EMOJI_PATTERN = /^[a-z0-9_+-]+$/i;

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

export function resolveWorkspaceStatusEmojiDisplay(
  value: string | null | undefined,
): string | null {
  const emoji = value?.trim() ?? "";
  if (emoji.length === 0) {
    return null;
  }

  const legacySymbol = LEGACY_STATUS_EMOJI_SYMBOLS[emoji];
  if (legacySymbol != null) {
    return legacySymbol;
  }

  return SHORTCODE_LIKE_STATUS_EMOJI_PATTERN.test(emoji) ? null : emoji;
}

export function selectUserStatusLabel(user: User | null | undefined): string | null {
  const text = user?.statusText?.trim() ?? "";
  const emoji = resolveWorkspaceStatusEmojiDisplay(user?.statusEmoji);
  if (text.length > 0) {
    return emoji != null ? `${emoji} ${text}` : text;
  }
  return emoji;
}
