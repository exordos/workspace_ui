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
  const normalized = name
    .trim()
    .replace(/^:+|:+$/g, "")
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]+/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized;
}

export function getUserStatusEmoji(status: UserStatus | null | undefined): string | null {
  if (!status) {
    return null;
  }
  if (status.emojiCode) {
    return decodeUnicodeEmojiCode(status.emojiCode);
  }
  if (status.emojiName) {
    return EMOJI_NAME_FALLBACKS[status.emojiName] ?? null;
  }
  return null;
}

export function formatUserStatusLabel(status: UserStatus | null | undefined): string | null {
  if (!status) {
    return null;
  }
  const emoji = getUserStatusEmoji(status);
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
