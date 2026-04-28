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
  puppy: "1F436",
  kitten: "1F431",
  tiger_cub: "1F42F",
  pony: "1F434",
  calf: "1F42E",
  piglet: "1F437",
  arabian_camel: "1F42A",
  hippopotamus: "1F99B",
  dormouse: "1F42D",
  bunny: "1F430",
  hatching: "1F423",
  chick: "1F424",
  new_baby: "1F425",
  humpback_whale: "1F433",
  web: "1F578-FE0F",
  tree: "1F333",
  harvest: "1F33E",
  lucky: "1F340",
  ginger_root: "1FADA",
  pea_pod: "1FADB",
  baguette: "1F956",
  meat: "1F356",
  drumstick: "1F357",
  paella: "1F958",
  food: "1F372",
  senbei: "1F358",
  onigiri: "1F359",
  yam: "1F360",
  tempura: "1F364",
  naruto: "1F365",
  donut: "1F369",
  chocolate: "1F36B",
  honey: "1F36F",
  wine: "1F377",
  clink: "1F942",
  small_glass: "1F943",
  hungry: "1F37D-FE0F",
  vase: "1F3FA",
  doner_kebab: "1F959",
  www: "1F310",
  map: "1F5FA-FE0F",
  snowy_mountain: "1F3D4-FE0F",
  campsite: "1F3D5-FE0F",
  suburb: "1F3D8-FE0F",
  japan_post: "1F3E3",
  shiro: "1F3EF",
  tower: "1F5FC",
  statue: "1F5FD",
  night: "1F303",
  city: "1F3D9-FE0F",
  mountain_sunrise: "1F304",
  sunset: "1F307",
  bridge: "1F309",
  brick: "1F312",
  hot_springs: "2668-FE0F",
  carousel: "1F3A0",
  circus: "1F3AA",
  high_speed_train: "1F684",
  bullet_train: "1F685",
  oncoming_train: "1F686",
  subway: "1F687",
  oncoming_tram: "1F68A",
  trolley: "1F68E",
  fire_truck: "1F692",
  oncoming_car: "1F698",
  recreational_vehicle: "1F699",
  moving_truck: "1F69A",
  racecar: "1F3CE-FE0F",
  kick_scooter: "1F6F4",
  bus_stop: "1F68F",
  road: "1F6E3-FE0F",
  fuel_pump: "26FD",
  siren: "1F6A8",
  horizontal_traffic_light: "1F6A5",
  work_in_progress: "1F6A7",
  boat: "26F5",
  motor_boat: "1F6E5",
  take_off: "1F6EB",
  landing: "1F6EC",
  gondola: "1F6A0",
  bellhop_bell: "1F6CE",
  times_up: "231B",
  time_ticking: "23F3",
  timer: "23F2",
  mantelpiece_clock: "1F570-FE0F",
  time: "1F553",
  waxing_moon: "1F314",
  moon: "1F319",
  new_moon_face: "1F31A",
  goodnight: "1F31A",
  last_quarter_moon_face: "1F31C",
  temperature: "1F321-FE0F",
  moon_face: "1F31D",
  sun_face: "1F31E",
  thunderstorm: "26C8-FE0F",
  mostly_sunny: "1F324-FE0F",
  sunshowers: "1F326-FE0F",
  windy: "1F32C-FE0F",
  frosty: "26C4",
  drop: "1F4A7",
  dark_sunglasses: "1F576-FE0F",
  tie: "1F454",
  clothing: "1F45A",
  folding_hand_fan: "1FAAD",
  shoe: "1F45E",
  high_heels: "1F460",
  hat: "1F452",
  graduate: "1F393",
  helmet: "26D1-FE0F",
  softer: "1F509",
  louder: "1F50A",
  horn: "1F4EF",
  notifications: "1F514",
  mute_notifications: "1F515",
  music: "1F3B5",
  volume: "1F39A-FE0F",
  piano: "1F3B9",
  phone: "1F4DE",
  landline: "260E-FE0F",
  gold_record: "1F4BD",
  film: "1F39E-FE0F",
  projector: "1F4FD-FE0F",
  action: "1F3AC",
  taking_a_picture: "1F4F8",
  search: "1F50D",
  magnifying_glass_tilted_right: "1F50E",
  lantern: "1F3EE",
  decorative_notebook: "1F4D4",
  red_book: "1F4D5",
  document: "1F4C4",
  headlines: "1F5DE-FE0F",
  place_holder: "1F4D1",
  money: "1F4B0",
  yen_banknotes: "1F4B4",
  dollar_bills: "1F4B5",
  euro_banknotes: "1F4B6",
  pound_notes: "1F4B7",
  losing_money: "1F4B8",
  stock_market: "1F4C8",
  mail_received: "1F4E8",
  mail_sent: "1F4E9",
  outbox: "1F4E4",
  inbox: "1F4E5",
  closed_mailbox: "1F4EA",
  unread_mail: "1F4EC",
  inbox_zero: "1F4ED",
  mail_dropoff: "1F4EE",
  organize: "1F5C2-FE0F",
  folder: "1F4C1",
  sort: "1F4C2",
  spiral_notepad: "1F5D2-FE0F",
  spiral_calendar: "1F5D3-FE0F",
  rolodex: "1F4C7",
  downwards_trend: "1F4C9",
  push_pin: "1F4CD",
  pin: "1F4CC",
  office_supplies: "1F587-FE0F",
  ruler: "1F4CF",
  carpenter_square: "1F4D0",
  archive: "1F5C3-FE0F",
  privacy: "1F50F",
  secure: "1F510",
  mine: "26CF-FE0F",
  at_work: "2692-FE0F",
  duel: "2694-FE0F",
  fixing: "1F527",
  justice: "2696-FE0F",
  alchemy: "2697-FE0F",
  science: "1F52C",
  injection: "1F489",
  medicine: "1F48A",
  living_room: "1F6CB-FE0F",
  rock_carving: "1F5FF",
  identification_card: "1FAAA",
  accessible: "267F",
  baby_change_station: "1F6BC",
  locker: "1F6C5",
  prohibited: "1F6AB",
  no_phones: "1F4F5",
  upper_right: "2197-FE0F",
  right: "27A1-FE0F",
  lower_right: "2198-FE0F",
  lower_left: "2199-FE0F",
  left: "2B05-FE0F",
  upper_left: "2196-FE0F",
  up_down: "2195-FE0F",
  left_right: "2194-FE0F",
  reply: "21A9-FE0F",
  forward: "21AA-FE0F",
  heading_up: "2934-FE0F",
  heading_down: "2935-FE0F",
  cross: "271D-FE0F",
  dotted_six_pointed_star: "1F52F",
  play_reverse: "25C0-FE0F",
  upvote: "1F53C",
  double_up: "23EB",
  downvote: "1F53D",
  double_down: "23EC",
  stop_button: "23F9-FE0F",
  eject_button: "23CF-FE0F",
  brightness: "1F506",
  cell_reception: "1F4F6",
  phone_off: "1F4F4",
  grey_question: "2754",
  grey_exclamation: "2755",
  exchange: "1F4B1",
  dollars: "1F4B2",
  circle: "2B55",
  check: "2705",
  checkbox: "2611",
  double_loop: "27BF",
  part_alternation: "303D",
  eight_pointed_star: "2734-FE0F",
  squared_ok: "1F197",
  squared_up: "1F199",
  japanese_here_button: "1F201",
  japanese_service_charge_button: "1F202-FE0F",
  japanese_monthly_amount_button: "1F237-FE0F",
  japanese_not_free_of_charge_button: "1F236",
  japanese_reserved_button: "1F22F",
  japanese_bargain_button: "1F250",
  japanese_discount_button: "1F239",
  japanese_free_of_charge_button: "1F21A",
  japanese_prohibited_button: "1F232",
  japanese_acceptable_button: "1F251",
  japanese_application_button: "1F238",
  japanese_passing_grade_button: "1F234",
  japanese_vacancy_button: "1F233",
  japanese_congratulations_button: "3297-FE0F",
  japanese_secret_button: "3299-FE0F",
  japanese_open_for_business_button: "1F23A",
  japanese_no_vacancy_button: "1F235",
  yellow_large_square: "1F7E8",
  green_large_square: "1F7E9",
  red_triangle_up: "1F53A",
  red_triangle_down: "1F53B",
  cute: "1F4A0",
  black_and_white_square: "1F533",
  white_and_black_square: "1F532",
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
