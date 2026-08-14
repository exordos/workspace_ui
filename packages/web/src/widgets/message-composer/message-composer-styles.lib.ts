/** Shared Tailwind class strings for composer toolbar and mode tabs. */

/**
 * Shared left inset for the compact expand toggle and the expanded toolbar
 * collapse toggle. Compact input uses pl-3 (12px); the bottom toolbar must
 * use the same inset so both 32px icons sit on one vertical axis.
 */
export const COMPOSER_LEADING_CONTROLS_INSET = "pl-3";
/**
 * Expanded toolbar must clear the send button (h-10 / 40px) plus the input-row
 * gap-3 (12px). Keep this in sync if either size changes.
 */
export const COMPOSER_TOOLBAR_SEND_CLEARANCE = "mr-[52px]";

/** Formatting toolbar icon/text buttons — uses shared icon hover contract (see app.styles.css). */
export const TOOLBAR_BTN = "composer-toolbar-btn flex h-8 w-8 items-center justify-center";
/**
 * Link/B/I/S glyphs are narrower than the 32px hit area, so a group-level
 * gap-2 looks emptier than attach/emoji. Sit this cluster flush.
 */
export const TOOLBAR_TEXT_STYLE_GROUP = "flex items-center gap-0";
/** Text glyphs (B, I, S, 1.) inside the shared 32px button area. */
export const TOOLBAR_GLYPH = "select-none text-[15px] font-medium leading-none text-current";
/** Quote glyph (>) — punctuation metrics sit low; nudge up for optical centering in the button. */
export const TOOLBAR_QUOTE_GLYPH =
  "select-none inline-block -translate-y-px text-[15px] font-semibold leading-none text-current";
/** Mono glyphs (||) — same size as TOOLBAR_GLYPH. */
export const TOOLBAR_MONO_GLYPH = "select-none font-mono text-[15px] leading-none text-current";
/** Wider mono labels (</>, { }) — smaller so they fit the 32px button. */
export const TOOLBAR_MONO_COMPACT_GLYPH =
  "select-none font-mono text-[13px] leading-none text-current";
/** Square SVG icons in the formatting toolbar row. */
export const TOOLBAR_ICON_SIZE = 24;
/** Figma vector bounds for add_link. */
export const TOOLBAR_LINK_ICON_WIDTH = 24;
export const TOOLBAR_LINK_ICON_HEIGHT = 14.769;
/** Figma vector bounds for format_list_bulleted. */
export const TOOLBAR_BULLETED_LIST_ICON_WIDTH = 21.328;
export const TOOLBAR_BULLETED_LIST_ICON_HEIGHT = 19.533;
/**
 * Heavier visual weight for thin outline-style toolbar icons (links, attach, phone, pen).
 * Composer-only — does not change shared SVG assets used elsewhere.
 */
export const TOOLBAR_ICON_EMPHASIS_CLASS =
  "[&_path]:stroke-current [&_path]:[stroke-width:1px] [&_path]:[paint-order:stroke_fill]";
/** Write/Preview toggle — opt out of global svg-only button colors (see app.styles.css). */
export const MODE_TAB_BTN =
  "composer-mode-tab-btn flex h-8 w-8 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft";
/** Active tab: accent pill + icon-active (same token as inactive hover). */
export const MODE_TAB_ACTIVE = "bg-accent text-icon-active";
export const MODE_TAB_INACTIVE =
  "text-composer-icon hover:bg-bg-elevated/60 hover:text-icon-active";
