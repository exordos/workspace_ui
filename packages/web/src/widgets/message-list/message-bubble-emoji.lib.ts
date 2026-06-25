/**
 * Emoji display helpers for message reactions (Zulip emoji_name / emoji_code).
 */
import type { MessageReactionPayload, MockMessage, Reaction } from "~/shared/api/zulip.types";
import {
  normalizeEmojiShortcodeName,
  resolveShortcodeToUnicode,
} from "~/shared/lib/emoji-shortcodes.lib";
import { zulipEmojiPayloadFromPickerData } from "~/shared/lib/zulip-emoji-payload.lib";
import type { EmojiClickData } from "emoji-picker-react";

export const QUICK_REACTIONS = [
  { emojiName: "heart", a11yLabelKey: "a11y.like" },
  { emojiName: "thumbs_up", a11yLabelKey: "a11y.thumbsUp" },
  { emojiName: "joy", a11yLabelKey: "a11y.joy" },
  { emojiName: "open_mouth", a11yLabelKey: "a11y.surprised" },
  { emojiName: "cry", a11yLabelKey: "a11y.crying" },
  { emojiName: "clap", a11yLabelKey: "a11y.clap" },
] as const;

export function resolveEmojiShortcodeDisplayGlyph(emojiName: string): string {
  const normalizedEmojiName = normalizeEmojiShortcodeName(emojiName);
  if (normalizedEmojiName.length === 0) {
    return emojiName;
  }
  const fromSharedResolver = resolveShortcodeToUnicode(normalizedEmojiName);
  if (fromSharedResolver != null) {
    return fromSharedResolver;
  }
  return emojiName;
}

export function emojiCodeToChar(emojiCode: string): string {
  try {
    const codePoints = emojiCode.split("-").map((hex) => parseInt(hex, 16));
    if (codePoints.some((n) => Number.isNaN(n))) return "";
    return String.fromCodePoint(...codePoints);
  } catch {
    return "";
  }
}

function normalizeEmojiSemanticKey(value: string): string {
  return Array.from(value.normalize("NFC"))
    .map((char) => char.codePointAt(0))
    .filter((codePoint): codePoint is number => codePoint != null && codePoint !== 0xfe0e)
    .filter((codePoint) => codePoint !== 0xfe0f)
    .map((codePoint) => codePoint.toString(16))
    .join("-");
}

function hasEmojiPresentationSelector(value: string): boolean {
  return Array.from(value.normalize("NFC")).some((char) => char.codePointAt(0) === 0xfe0f);
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

export function reactionPayloadFromEmojiClickData(
  data: EmojiClickData,
): MessageReactionPayload | null {
  return zulipEmojiPayloadFromPickerData(data, { mode: "strict" });
}

export function getReactionDisplayChar(reaction: Reaction): string {
  const fromShortcode = resolveEmojiShortcodeDisplayGlyph(reaction.emoji_name);
  if (reaction.reaction_type === "unicode_emoji") {
    const fromCode = emojiCodeToChar(reaction.emoji_code);
    if (fromCode) {
      const codeSemanticKey = normalizeEmojiSemanticKey(fromCode);
      const shortcodeSemanticKey = normalizeEmojiSemanticKey(fromShortcode);
      const shouldPreferShortcodeGlyph =
        codeSemanticKey.length > 0 &&
        codeSemanticKey === shortcodeSemanticKey &&
        hasEmojiPresentationSelector(fromShortcode) &&
        !hasEmojiPresentationSelector(fromCode);
      if (shouldPreferShortcodeGlyph) {
        return fromShortcode;
      }
      return fromCode;
    }
  }
  return fromShortcode;
}

export interface GroupedReaction {
  key: string;
  emojiName: string;
  emojiCode: string;
  reactionType: Reaction["reaction_type"];
  count: number;
  userIds: number[];
  displayChar: string;
  imageUrl?: string;
}

/** Group reactions by (emoji_name, reaction_type): { count, userIds, displayChar }. */
export function groupReactions(
  reactions: Reaction[],
  resolveCustomEmojiImageUrl?: (reaction: Reaction) => string | undefined,
): GroupedReaction[] {
  const map = new Map<
    string,
    {
      emojiName: string;
      emojiCode: string;
      reactionType: Reaction["reaction_type"];
      userIds: number[];
      userIdSet: Set<number>;
      displayChar: string;
      imageUrl?: string;
    }
  >();
  for (const r of reactions) {
    const key = `${r.reaction_type}:${r.emoji_name}:${r.emoji_code}`;
    const displayChar = getReactionDisplayChar(r);
    const imageUrl =
      r.reaction_type === "realm_emoji" ? resolveCustomEmojiImageUrl?.(r) : undefined;
    const existing = map.get(key);
    if (existing) {
      if (!existing.userIdSet.has(r.user_id)) {
        existing.userIdSet.add(r.user_id);
        existing.userIds.push(r.user_id);
      }
      if (existing.imageUrl == null && imageUrl != null) {
        existing.imageUrl = imageUrl;
      }
    } else {
      map.set(key, {
        emojiName: r.emoji_name,
        emojiCode: r.emoji_code,
        reactionType: r.reaction_type,
        userIds: [r.user_id],
        userIdSet: new Set([r.user_id]),
        displayChar,
        ...(imageUrl != null ? { imageUrl } : {}),
      });
    }
  }
  return Array.from(map.entries()).map(
    ([key, { emojiName, emojiCode, reactionType, userIds, displayChar, imageUrl }]) => ({
      key,
      emojiName,
      emojiCode,
      reactionType,
      count: userIds.length,
      userIds,
      displayChar,
      ...(imageUrl != null ? { imageUrl } : {}),
    }),
  );
}
