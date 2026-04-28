import emojibaseShortcodes from "emojibase-data/en/shortcodes/emojibase.json";

type EmojibaseShortcodeEntry = string | string[];
type EmojibaseShortcodeDataset = Record<string, EmojibaseShortcodeEntry>;

const ZULIP_SHORTCODE_TO_UNIFIED_OVERRIDES: Readonly<Record<string, string>> = {
  working_on_it: "1F6E0",
  thumbs_up: "1F44D",
  hand: "270B",
  spock: "1F596",
  palm_down_hand: "1FAF3",
  palm_up_hand: "1FAF4",
  peace_sign: "270C-FE0F",
  rock_on: "1F918",
  call_me: "1F919",
  wait_one_second: "261D-FE0F",
  index_pointing_at_the_viewer: "1FAF5",
  fist_bump: "1F44A",
  left_fist: "1F91B",
  right_fist: "1F91C",
  writing: "270D-FE0F",
  person: "1F9D1",
  person_blond_hair: "1F471",
  person_beard: "1F9D4",
  man_beard: "1F9D4-200D-2642",
  woman_beard: "1F9D4-200D-2640",
  man_red_hair: "1F468-200D-1F9B0",
  man_curly_hair: "1F468-200D-1F9B1",
  man_white_hair: "1F468-200D-1F9B3",
  woman_red_hair: "1F469-200D-1F9B0",
  person_red_hair: "1F9D1-200D-1F9B0",
  woman_curly_hair: "1F469-200D-1F9B1",
  person_curly_hair: "1F9D1-200D-1F9B1",
  woman_white_hair: "1F469-200D-1F9B3",
  person_white_hair: "1F9D1-200D-1F9B3",
  person_bald: "1F9D1-200D-1F9B2",
  woman_blond_hair: "1F471-200D-2640",
  man_blond_hair: "1F471-200D-2642",
  older_person: "1F9D3",
  no_signal: "1F645",
  ok_signal: "1F646",
  information_desk_person: "1F481",
  raising_hand: "1F64B",
  face_palm: "1F926",
  police: "1F46E",
  turban: "1F473",
  gua_pi_mao: "1F472",
  tuxedo: "1F935",
  bride: "1F470",
  pregnant: "1F930",
  mother_christmas: "1F936",
  person_walking_facing_right: "1F6B6-200D-27A1",
  woman_walking_facing_right: "1F6B6-200D-2640-200D-27A1",
  man_walking_facing_right: "1F6B6-200D-2642-200D-27A1",
  person_kneeling_facing_right: "1F9CE-200D-27A1",
  woman_kneeling_facing_right: "1F9CE-200D-2640-200D-27A1",
  man_kneeling_facing_right: "1F9CE-200D-2642-200D-27A1",
  person_with_white_cane_facing_right: "1F9D1-200D-1F9AF-200D-27A1",
  man_with_white_cane_facing_right: "1F468-200D-1F9AF-200D-27A1",
  woman_with_white_cane_facing_right: "1F469-200D-1F9AF-200D-27A1",
  person_in_motorized_wheelchair_facing_right: "1F9D1-200D-1F9BC-200D-27A1",
  man_in_motorized_wheelchair_facing_right: "1F468-200D-1F9BC-200D-27A1",
  woman_in_motorized_wheelchair_facing_right: "1F469-200D-1F9BC-200D-27A1",
  person_in_manual_wheelchair_facing_right: "1F9D1-200D-1F9BD-200D-27A1",
  man_in_manual_wheelchair_facing_right: "1F468-200D-1F9BD-200D-27A1",
  woman_in_manual_wheelchair_facing_right: "1F469-200D-1F9BD-200D-27A1",
  person_running_facing_right: "1F3C3-200D-27A1",
  woman_running_facing_right: "1F3C3-200D-2640-200D-27A1",
  man_running_facing_right: "1F3C3-200D-2642-200D-27A1",
  dancing: "1F57A",
  men_with_bunny_ears: "1F46F-200D-2642",
  women_with_bunny_ears: "1F46F-200D-2640",
  surf: "1F3C4",
  swim: "1F3CA",
  ball: "26F9",
  lift: "1F3CB",
  cyclist: "1F6B4",
  mountain_biker: "1F6B5",
  cartwheel: "1F938",
  in_bed: "1F6CC",
  man_and_woman_holding_hands: "1F46B",
  kiss_woman_man: "1F469-200D-2764-FE0F-200D-1F48B-200D-1F468",
  kiss_man_man: "1F468-200D-2764-FE0F-200D-1F48B-200D-1F468",
  kiss_woman_woman: "1F469-200D-2764-FE0F-200D-1F48B-200D-1F469",
  couple_with_heart_woman_man: "1F469-200D-2764-FE0F-200D-1F468",
  couple_with_heart_man_man: "1F468-200D-2764-FE0F-200D-1F468",
  couple_with_heart_woman_woman: "1F469-200D-2764-FE0F-200D-1F469",
  family_man_woman_boy: "1F468-200D-1F469-200D-1F466",
  family_man_woman_girl: "1F468-200D-1F469-200D-1F467",
  family_man_woman_girl_boy: "1F468-200D-1F469-200D-1F467-200D-1F466",
  family_man_woman_boy_boy: "1F468-200D-1F469-200D-1F466-200D-1F466",
  family_man_woman_girl_girl: "1F468-200D-1F469-200D-1F467-200D-1F467",
  family_man_man_boy: "1F468-200D-1F468-200D-1F466",
  family_man_man_girl: "1F468-200D-1F468-200D-1F467",
  family_man_man_girl_boy: "1F468-200D-1F468-200D-1F467-200D-1F466",
  family_man_man_boy_boy: "1F468-200D-1F468-200D-1F466-200D-1F466",
  family_man_man_girl_girl: "1F468-200D-1F468-200D-1F467-200D-1F467",
  family_woman_woman_boy: "1F469-200D-1F469-200D-1F466",
  family_woman_woman_girl: "1F469-200D-1F469-200D-1F467",
  family_woman_woman_girl_boy: "1F469-200D-1F469-200D-1F467-200D-1F466",
  family_woman_woman_boy_boy: "1F469-200D-1F469-200D-1F466-200D-1F466",
  family_woman_woman_girl_girl: "1F469-200D-1F469-200D-1F467-200D-1F467",
  family_man_boy: "1F468-200D-1F466",
  family_man_boy_boy: "1F468-200D-1F466-200D-1F466",
  family_man_girl: "1F468-200D-1F467",
  family_man_girl_boy: "1F468-200D-1F467-200D-1F466",
  family_man_girl_girl: "1F468-200D-1F467-200D-1F467",
  family_woman_boy: "1F469-200D-1F466",
  family_woman_boy_boy: "1F469-200D-1F466-200D-1F466",
  family_woman_girl: "1F469-200D-1F467",
  family_woman_girl_boy: "1F469-200D-1F467-200D-1F466",
  family_woman_girl_girl: "1F469-200D-1F467-200D-1F467",
  silhouette: "1F464",
  silhouettes: "1F465",
  family_adult_adult_child: "1F9D1-200D-1F9D1-200D-1F9D2",
  family_adult_adult_child_child: "1F9D1-200D-1F9D1-200D-1F9D2-200D-1F9D2",
  family_adult_child: "1F9D1-200D-1F9D2",
  family_adult_child_child: "1F9D1-200D-1F9D2-200D-1F9D2",
  grinning_face_with_smiling_eyes: "1F604",
  rolling_on_the_floor_laughing: "1F923",
  slight_smile: "1F642",
  upside_down: "1F643",
  smiling_face_with_hearts: "1F970",
  heart_kiss: "1F618",
  kiss_with_blush: "1F61A",
  kiss_smiling_eyes: "1F619",
  money_face: "1F911",
  stuck_out_tongue_wink: "1F61C",
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
  face_with_spiral_eyes: "1F635-200D-1F4AB",
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
