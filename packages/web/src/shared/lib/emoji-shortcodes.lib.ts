import emojibaseShortcodes from "emojibase-data/en/shortcodes/emojibase.json";
import {
  ZULIP_CANONICAL_SHORTCODE_BY_UNIFIED_OVERRIDES,
  ZULIP_SHORTCODE_TO_UNIFIED_OVERRIDES,
} from "~/shared/lib/emoji-shortcodes-overrides.data";

/** Runtime emoji shortcode resolution: normalization, indices, and lookup. */
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
  return sanitized
    .split("-")
    .filter((part) => part.length > 0)
    .join("-");
}

function normalizeUnifiedCodeWithoutEmojiVariation(unified: string): string {
  const normalized = normalizeUnifiedCodeForLookup(unified);
  if (normalized.length === 0) {
    return "";
  }
  return normalized
    .split("-")
    .filter((part) => part.length > 0 && part !== "fe0f")
    .join("-");
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
  const dataset = emojibaseShortcodes;
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
    // Zulip-specific aliases must take precedence over emojibase defaults.
    aliasToCodepoints.set(alias, new Set([unified]));
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
    if (codepoints.size === 0) {
      continue;
    }
    const groupedByBase = new Map<string, string[]>();
    for (const codepoint of codepoints) {
      const base = normalizeUnifiedCodeWithoutEmojiVariation(codepoint);
      if (base.length === 0) {
        continue;
      }
      const variants = groupedByBase.get(base);
      if (variants == null) {
        groupedByBase.set(base, [codepoint]);
      } else {
        variants.push(codepoint);
      }
    }
    if (groupedByBase.size !== 1) {
      continue;
    }
    const variants = groupedByBase.values().next().value;
    if (variants == null || variants.length === 0) {
      continue;
    }
    // Prefer the emoji presentation variant when VS16 is available.
    const preferred = variants.find((variant: string) => variant.includes("fe0f")) ?? variants[0];
    if (preferred == null) {
      continue;
    }
    const unicode = decodeUnicodeEmojiCode(preferred);
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
  const canonical = getShortcodeIndices().canonicalShortcodeByUnified;
  const exact = canonical.get(normalized);
  if (exact != null) {
    return exact;
  }
  const withoutVariation = normalizeUnifiedCodeWithoutEmojiVariation(normalized);
  if (withoutVariation.length === 0) {
    return null;
  }
  return canonical.get(withoutVariation) ?? null;
}
