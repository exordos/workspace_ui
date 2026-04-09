/**
 * Emoji display helpers for message reactions (Zulip emoji_name / emoji_code).
 */
import type { MockMessage, Reaction } from "~/shared/api/zulip.types";

/** Common emoji_name → character map (fallback when emoji_code cannot be converted). */
export const EMOJI_NAME_TO_CHAR: Record<string, string> = {
  thumbs_up: "👍",
  heart: "❤️",
  smile: "😄",
  joy: "😂",
  open_mouth: "😮",
  cry: "😢",
  clap: "👏",
  "+1": "👍",
  eyes: "👀",
  tada: "🎉",
  wave: "👋",
};

export const QUICK_REACTIONS = [
  { emojiName: "heart", a11yLabelKey: "a11y.like" },
  { emojiName: "thumbs_up", a11yLabelKey: "a11y.thumbsUp" },
  { emojiName: "joy", a11yLabelKey: "a11y.joy" },
  { emojiName: "open_mouth", a11yLabelKey: "a11y.surprised" },
  { emojiName: "cry", a11yLabelKey: "a11y.crying" },
  { emojiName: "clap", a11yLabelKey: "a11y.clap" },
] as const;

export function emojiCodeToChar(emojiCode: string): string {
  try {
    const codePoints = emojiCode.split("-").map((hex) => parseInt(hex, 16));
    if (codePoints.some((n) => Number.isNaN(n))) return "";
    return String.fromCodePoint(...codePoints);
  } catch {
    return "";
  }
}

/**
 * True for a Zulip 1:1 DM (`private` with exactly two recipients). Group huddles have three or more.
 * Aligned with `messageToDmEntry` in `entities/chat-list/chat-list.lib.ts`.
 */
export function isOneToOneDirectMessage(message: MockMessage): boolean {
  return (
    message.stream_id == null &&
    Array.isArray(message.display_recipient) &&
    message.display_recipient.length === 2
  );
}

export function getReactionDisplayChar(reaction: Reaction): string {
  const fromCode = emojiCodeToChar(reaction.emoji_code);
  if (fromCode) return fromCode;
  return EMOJI_NAME_TO_CHAR[reaction.emoji_name] ?? reaction.emoji_name;
}

export type GroupedReaction = {
  key: string;
  count: number;
  userIds: number[];
  displayChar: string;
};

/** Group reactions by (emoji_name, reaction_type): { count, userIds, displayChar }. */
export function groupReactions(reactions: Reaction[]): GroupedReaction[] {
  const map = new Map<string, { userIds: number[]; displayChar: string }>();
  for (const r of reactions) {
    const key = `${r.reaction_type}:${r.emoji_name}`;
    const displayChar = getReactionDisplayChar(r);
    const existing = map.get(key);
    if (existing) {
      if (!existing.userIds.includes(r.user_id)) existing.userIds.push(r.user_id);
    } else {
      map.set(key, { userIds: [r.user_id], displayChar });
    }
  }
  return Array.from(map.entries()).map(([key, { userIds, displayChar }]) => ({
    key,
    count: userIds.length,
    userIds,
    displayChar,
  }));
}
