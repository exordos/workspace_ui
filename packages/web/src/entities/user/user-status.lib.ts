import type { RealmEmoji } from "~/shared/api/zulip.types";
import { normalizeEmojiShortcodeName } from "~/shared/lib/emoji-shortcodes.lib";
import { getCachedRealmEmojis } from "~/shared/lib/realm-emojis-cache";
import type { UserStatus } from "./user.model";

const EMOJI_NAME_FALLBACKS: Record<string, string> = {
  speech_balloon: "💬",
  house: "🏠",
  palm_tree: "🌴",
  plate_with_cutlery: "🍽️",
  no_entry_sign: "🚫",
  helmet_with_white_cross: "⛑️",
  spiral_calendar_pad: "🗓️",
};

function decodeUnicodeEmojiCode(code: string): string | null {
  const sanitized = code.trim().replace(/_/g, "-");
  if (!sanitized) {
    return null;
  }
  const points = sanitized
    .split("-")
    .map((part) => Number.parseInt(part, 16))
    .filter((point) => Number.isFinite(point));
  if (points.length === 0) {
    return null;
  }
  return String.fromCodePoint(...points);
}

export function encodeEmojiToCode(emoji: string): string {
  const normalized = emoji.trim();
  if (!normalized) {
    return "";
  }
  const codePoints: string[] = [];
  for (const symbol of normalized) {
    const codePoint = symbol.codePointAt(0);
    if (codePoint == null) {
      continue;
    }
    codePoints.push(codePoint.toString(16));
  }
  return codePoints.join("-");
}

export function normalizeStatusEmojiName(name: string): string {
  return normalizeEmojiShortcodeName(name);
}

export type UserStatusEmojiDisplay =
  { kind: "image"; src: string; alt: string } | { kind: "text"; text: string };

function getRealmEmojiFallbackLabel(status: UserStatus): string | null {
  const emojiName = normalizeStatusEmojiName(status.emojiName ?? "");
  return emojiName.length > 0 ? `:${emojiName}:` : null;
}

function resolveRealmEmojiImageUrl(
  status: UserStatus,
  realmEmojis: readonly RealmEmoji[],
): string | null {
  const emojiCode = status.emojiCode?.trim() ?? "";
  const emojiName = normalizeStatusEmojiName(status.emojiName ?? "");
  if (emojiCode.length > 0) {
    const byCode = realmEmojis.find((emoji) => emoji.id.trim() === emojiCode);
    if (byCode?.imgUrl) {
      return byCode.imgUrl;
    }
  }
  if (emojiName.length > 0) {
    const byName = realmEmojis.find((emoji) =>
      emoji.names.some((name) => normalizeStatusEmojiName(name) === emojiName),
    );
    if (byName?.imgUrl) {
      return byName.imgUrl;
    }
  }
  return null;
}

export function getUserStatusEmojiDisplay(
  status: UserStatus | null | undefined,
  realmEmojis: readonly RealmEmoji[] = getCachedRealmEmojis(),
): UserStatusEmojiDisplay | null {
  if (!status) {
    return null;
  }
  if (status.reactionType === "realm_emoji") {
    const fallbackLabel = getRealmEmojiFallbackLabel(status);
    if (fallbackLabel == null) {
      return null;
    }
    const imageUrl = resolveRealmEmojiImageUrl(status, realmEmojis);
    if (imageUrl != null) {
      return { kind: "image", src: imageUrl, alt: fallbackLabel };
    }
    return null;
  }
  if (
    status.emojiCode &&
    (status.reactionType == null || status.reactionType === "unicode_emoji")
  ) {
    const decoded = decodeUnicodeEmojiCode(status.emojiCode);
    return decoded != null ? { kind: "text", text: decoded } : null;
  }
  if (status.emojiName) {
    const fallback = EMOJI_NAME_FALLBACKS[status.emojiName] ?? null;
    return fallback != null ? { kind: "text", text: fallback } : null;
  }
  return null;
}

export function getUserStatusEmoji(status: UserStatus | null | undefined): string | null {
  const display = getUserStatusEmojiDisplay(status);
  return display?.kind === "text" ? display.text : null;
}

export function formatUserStatusLabel(status: UserStatus | null | undefined): string | null {
  if (!status) {
    return null;
  }
  const display = getUserStatusEmojiDisplay(status, []);
  let emoji: string | null = null;
  if (display?.kind === "text") {
    emoji = display.text;
  }
  const text = status.text.trim();
  if (emoji && text) {
    return `${emoji} ${text}`;
  }
  if (emoji) {
    return emoji;
  }
  if (text) {
    return text;
  }
  return null;
}
