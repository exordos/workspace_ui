import type { ReactionType } from "~/shared/api/zulip.types";
import {
  normalizeEmojiShortcodeName,
  resolveUnicodeToCanonicalShortcode,
} from "./emoji-shortcodes.lib";
import { resolveZulipUnicodeEmojiFromCatalog } from "./zulip-emoji-catalog.lib";
import type { EmojiClickData } from "emoji-picker-react";

export interface ZulipEmojiPayload {
  emojiName: string;
  emojiCode: string;
  reactionType: ReactionType;
  imageUrl?: string;
}

export type ZulipEmojiPayloadMode = "strict" | "composerFallback";

function encodeEmojiToCode(value: string): string {
  return Array.from(value.normalize("NFC"))
    .map((char) => char.codePointAt(0))
    .filter((codePoint): codePoint is number => codePoint != null)
    .map((codePoint) => codePoint.toString(16))
    .join("-");
}

function normalizeEmojiCode(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .split("-")
    .filter((part) => part.length > 0)
    .join("-");
}

function withoutEmojiVariationSelector(code: string): string {
  return normalizeEmojiCode(code)
    .split("-")
    .filter((part) => part !== "fe0f")
    .join("-");
}

function resolveUnicodeLookupCodes(data: EmojiClickData): string[] {
  const encodedEmoji = data.emoji ? encodeEmojiToCode(data.emoji) : "";
  const rawCodes = [data.unified, data.unifiedWithoutSkinTone, encodedEmoji];
  const codes = new Set<string>();

  for (const rawCode of rawCodes) {
    const code = normalizeEmojiCode(rawCode);
    if (code.length === 0) {
      continue;
    }
    codes.add(code);
    const withoutVariation = withoutEmojiVariationSelector(code);
    if (withoutVariation.length > 0) {
      codes.add(withoutVariation);
    }
  }

  return Array.from(codes);
}

function resolveCustomEmojiPayload(data: EmojiClickData): ZulipEmojiPayload | null {
  const emojiName = normalizeEmojiShortcodeName(data.names?.[0] ?? "");
  const emojiCode = (data.unified || data.unifiedWithoutSkinTone || data.emoji || "").trim();

  if (emojiName.length === 0 || emojiCode.length === 0) {
    return null;
  }

  return {
    emojiName,
    emojiCode,
    reactionType: "realm_emoji",
    ...(data.imageUrl ? { imageUrl: data.imageUrl } : {}),
  };
}

function resolveUnicodeEmojiPayload(
  data: EmojiClickData,
  mode: ZulipEmojiPayloadMode,
): ZulipEmojiPayload | null {
  const lookupCodes = resolveUnicodeLookupCodes(data);
  const catalogEmoji = resolveZulipUnicodeEmojiFromCatalog(lookupCodes);

  if (catalogEmoji != null) {
    return {
      emojiName: catalogEmoji.emojiName,
      emojiCode: catalogEmoji.emojiCode,
      reactionType: catalogEmoji.reactionType,
    };
  }

  if (mode === "strict") {
    return null;
  }

  const fallbackCode = lookupCodes[0] ?? "";
  const fallbackName =
    resolveUnicodeToCanonicalShortcode(fallbackCode) ??
    normalizeEmojiShortcodeName(data.names?.[0] ?? "");

  if (fallbackName.length === 0 || fallbackCode.length === 0) {
    return null;
  }

  return {
    emojiName: fallbackName,
    emojiCode: fallbackCode,
    reactionType: "unicode_emoji",
  };
}

export function zulipEmojiPayloadFromPickerData(
  data: EmojiClickData,
  options: { mode: ZulipEmojiPayloadMode },
): ZulipEmojiPayload | null {
  if (data.isCustom) {
    return resolveCustomEmojiPayload(data);
  }

  return resolveUnicodeEmojiPayload(data, options.mode);
}
