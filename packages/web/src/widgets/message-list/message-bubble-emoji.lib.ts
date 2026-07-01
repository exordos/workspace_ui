/**
 * Emoji display helpers for message reactions.
 */
import type {
  MessageReactionPayload,
  MessageReactions,
  MockMessage,
} from "~/shared/api/messenger.types";
import {
  normalizeEmojiShortcodeName,
  resolveShortcodeToUnicode,
  resolveUnicodeToCanonicalShortcode,
} from "~/shared/lib/emoji-shortcodes.lib";
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

/**
 * True for a Workspace 1:1 DM (`private` with exactly two recipients).
 * Aligned with `messageToDmEntry` in `entities/chat-list/chat-list.lib.ts`.
 */
export function isOneToOneDirectMessage(message: MockMessage): boolean {
  return (
    message.stream_uuid == null &&
    Array.isArray(message.display_recipient) &&
    message.display_recipient.length === 2
  );
}

export function reactionPayloadFromEmojiClickData(
  data: EmojiClickData,
): MessageReactionPayload | null {
  const normalizedPickerName = normalizeEmojiShortcodeName(data.names?.[0] ?? data.emoji ?? "");
  if (data.isCustom) {
    if (normalizedPickerName.length === 0) {
      return null;
    }
    return {
      emojiName: normalizedPickerName,
      imageUrl: data.imageUrl || undefined,
    };
  }
  const unifiedCode = (data.unifiedWithoutSkinTone || data.unified || "").trim().toLowerCase();
  const emojiName = resolveUnicodeToCanonicalShortcode(unifiedCode) ?? normalizedPickerName;
  if (emojiName.length === 0) {
    return null;
  }
  return { emojiName };
}

export function getReactionDisplayChar(emojiName: string): string {
  return resolveEmojiShortcodeDisplayGlyph(emojiName);
}

export interface GroupedReaction {
  key: string;
  emojiName: string;
  count: number;
  displayChar: string;
  imageUrl?: string;
}

function normalizedReactionCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** Group aggregate reactions by emoji_name: { count, displayChar }. */
export function groupReactions(
  reactions: MessageReactions,
  resolveCustomEmojiImageUrl?: (emojiName: string) => string | undefined,
): GroupedReaction[] {
  const groups: GroupedReaction[] = [];
  for (const [emojiName, rawCount] of Object.entries(reactions)) {
    const count = normalizedReactionCount(rawCount);
    if (emojiName.trim().length === 0 || count === 0) {
      continue;
    }
    const imageUrl = resolveCustomEmojiImageUrl?.(emojiName);
    groups.push({
      key: emojiName,
      emojiName,
      count,
      displayChar: getReactionDisplayChar(emojiName),
      ...(imageUrl != null ? { imageUrl } : {}),
    });
  }
  return groups;
}
