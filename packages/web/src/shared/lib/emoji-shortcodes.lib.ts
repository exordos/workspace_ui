import emojibaseShortcodes from "emojibase-data/en/shortcodes/emojibase.json";

type EmojibaseShortcodeEntry = string | string[];
type EmojibaseShortcodeDataset = Record<string, EmojibaseShortcodeEntry>;

const ZULIP_SHORTCODE_TO_UNIFIED_OVERRIDES: Readonly<Record<string, string>> = {
  working_on_it: "1F6E0",
  thumbs_up: "1F44D",
  grinning_face_with_smiling_eyes: "1F604",
  rolling_on_the_floor_laughing: "1F923",
  slight_smile: "1F642",
  upside_down: "1F643",
  smiling_face_with_hearts: "1F970",
  heart_kiss: "1F618",
  kiss_with_blush: "1F61A",
  kiss_smiling_eyes: "1F619",
  money_face: "1F911",
  face_with_open_eyes_and_hand_over_mouth: "1FAE2",
  silence: "1F910",
  speechless: "1F636",
  face_in_clouds: "1F636-200D-1F32B-FE0F",
  face_exhaling: "1F62E-200D-1F4A8",
  sick: "1F912",
  hurt: "1F915",
  oh_no: "1F615",
  frown: "1F641",
  sad: "2639-FE0F",
  fear: "1F628",
  exhausted: "1F625",
  anguish: "1F62B",
  smiling_devil: "1F608",
  devil: "1F47F",
  angry_cat: "1F63E",
  heart_pulse: "1F497",
  heart_box: "1F49F",
  lipstick_kiss: "1F48B",
  seeing_stars: "1F4AB",
  umm: "1F4AC",
  speech_bubble: "1F5E8-FE0F",
  anger_bubble: "1F5EF-FE0F",
  thought: "1F4AD",
};

const ZULIP_CANONICAL_SHORTCODE_BY_UNIFIED_OVERRIDES: Readonly<Record<string, string>> = {
  "1f6e0": "working_on_it",
  "1f44d": "thumbs_up",
};

interface ShortcodeIndices {
  unicodeByShortcode: ReadonlyMap<string, string>;
  canonicalShortcodeByUnified: ReadonlyMap<string, string>;
}

let shortcodeIndicesCache: ShortcodeIndices | null = null;

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
  try {
    return String.fromCodePoint(...points);
  } catch {
    return null;
  }
}

function normalizeUnifiedCodeForLookup(unified: string): string {
  const sanitized = unified.trim().toLowerCase().replace(/_/g, "-");
  if (!sanitized) {
    return "";
  }
  const parts = sanitized.split("-").filter((part) => part.length > 0 && part !== "fe0f");
  return parts.join("-");
}

export function normalizeEmojiShortcodeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^:+|:+$/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_+]+/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function pickPreferredCanonicalAlias(aliasesRaw: string[]): string | null {
  const aliases = aliasesRaw
    .map((alias) => normalizeEmojiShortcodeName(alias))
    .filter((alias) => alias.length > 0);
  if (aliases.length === 0) {
    return null;
  }
  const preferred = aliases.find(
    (alias) => !alias.startsWith("face_with_") && !alias.endsWith("_face"),
  );
  return preferred ?? aliases[0] ?? null;
}

function addAliasToCodepoint(
  aliasToCodepoints: Map<string, Set<string>>,
  alias: string,
  unified: string,
): void {
  const existing = aliasToCodepoints.get(alias);
  if (existing == null) {
    aliasToCodepoints.set(alias, new Set([unified]));
    return;
  }
  existing.add(unified);
}

function applyDatasetShortcodes(
  aliasToCodepoints: Map<string, Set<string>>,
  canonicalShortcodeByUnified: Map<string, string>,
): void {
  const dataset = emojibaseShortcodes as EmojibaseShortcodeDataset;
  for (const [hexCodeRaw, aliasesRaw] of Object.entries(dataset)) {
    const normalizedUnified = normalizeUnifiedCodeForLookup(hexCodeRaw);
    if (normalizedUnified.length === 0) {
      continue;
    }
    const aliases = Array.isArray(aliasesRaw) ? aliasesRaw : [aliasesRaw];
    const canonical = pickPreferredCanonicalAlias(aliases);
    if (
      canonical != null &&
      canonical.length > 0 &&
      !canonicalShortcodeByUnified.has(normalizedUnified)
    ) {
      canonicalShortcodeByUnified.set(normalizedUnified, canonical);
    }
    for (const aliasRaw of aliases) {
      const alias = normalizeEmojiShortcodeName(aliasRaw);
      if (alias.length > 0) {
        addAliasToCodepoint(aliasToCodepoints, alias, normalizedUnified);
      }
    }
  }
}

function applyZulipShortcodeOverrides(aliasToCodepoints: Map<string, Set<string>>): void {
  for (const [aliasRaw, unifiedRaw] of Object.entries(ZULIP_SHORTCODE_TO_UNIFIED_OVERRIDES)) {
    const alias = normalizeEmojiShortcodeName(aliasRaw);
    const unified = normalizeUnifiedCodeForLookup(unifiedRaw);
    if (alias.length === 0 || unified.length === 0) {
      continue;
    }
    addAliasToCodepoint(aliasToCodepoints, alias, unified);
  }
}

function applyZulipCanonicalOverrides(canonicalShortcodeByUnified: Map<string, string>): void {
  for (const [unifiedRaw, aliasRaw] of Object.entries(
    ZULIP_CANONICAL_SHORTCODE_BY_UNIFIED_OVERRIDES,
  )) {
    const unified = normalizeUnifiedCodeForLookup(unifiedRaw);
    const alias = normalizeEmojiShortcodeName(aliasRaw);
    if (unified.length > 0 && alias.length > 0) {
      canonicalShortcodeByUnified.set(unified, alias);
    }
  }
}

function buildUnicodeByShortcode(
  aliasToCodepoints: Map<string, Set<string>>,
): ReadonlyMap<string, string> {
  const unicodeByShortcode = new Map<string, string>();
  for (const [alias, codepoints] of aliasToCodepoints) {
    if (codepoints.size !== 1) {
      continue;
    }
    const [single] = codepoints;
    if (single == null) {
      continue;
    }
    const unicode = decodeUnicodeEmojiCode(single);
    if (unicode == null) {
      continue;
    }
    unicodeByShortcode.set(alias, unicode);
  }
  return unicodeByShortcode;
}

function buildShortcodeIndices(): ShortcodeIndices {
  const aliasToCodepoints = new Map<string, Set<string>>();
  const canonicalShortcodeByUnified = new Map<string, string>();
  applyDatasetShortcodes(aliasToCodepoints, canonicalShortcodeByUnified);
  applyZulipShortcodeOverrides(aliasToCodepoints);
  applyZulipCanonicalOverrides(canonicalShortcodeByUnified);

  return {
    unicodeByShortcode: buildUnicodeByShortcode(aliasToCodepoints),
    canonicalShortcodeByUnified,
  };
}

function getShortcodeIndices(): ShortcodeIndices {
  shortcodeIndicesCache ??= buildShortcodeIndices();
  return shortcodeIndicesCache;
}

export function resolveShortcodeToUnicode(shortcode: string): string | null {
  const normalized = normalizeEmojiShortcodeName(shortcode);
  if (normalized.length === 0) {
    return null;
  }
  return getShortcodeIndices().unicodeByShortcode.get(normalized) ?? null;
}

export function resolveUnicodeToCanonicalShortcode(unified: string): string | null {
  const normalized = normalizeUnifiedCodeForLookup(unified);
  if (normalized.length === 0) {
    return null;
  }
  return getShortcodeIndices().canonicalShortcodeByUnified.get(normalized) ?? null;
}
