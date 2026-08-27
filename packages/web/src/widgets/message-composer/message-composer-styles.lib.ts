/** Shared Tailwind class strings for composer toolbar and mode tabs. */

/**
 * Shared left inset for the compact expand toggle and the expanded toolbar
 * collapse toggle. Compact input uses pl-2 (8px); the bottom toolbar must
 * use the same inset so both 32px icons sit on one vertical axis.
 */
export const COMPOSER_LEADING_CONTROLS_INSET = "pl-2";
/**
 * Compact left rail when the field is tall enough to stack actions.
 * Keep the column on the bottom of the field: gap-1 separates 32px hover
 * pills, mb-1 matches the single-line optical inset above the rounded
 * container edge. Children render attach/emoji first, then the expand
 * toggle last, so the formatting icon stays first from the bottom.
 */
export const COMPOSER_COMPACT_RAIL_STACK = "flex w-8 flex-shrink-0 flex-col gap-1 self-end mb-1";
/**
 * Space between the 32px rail and the textarea. Keep a 12px gutter so the
 * stacked rail does not crowd the text even after the compact leading inset
 * was tightened to pl-2.
 */
export const COMPOSER_COMPACT_RAIL_FIELD_GAP = "gap-3";
/**
 * Single-line compact row: expand control sits beside the textarea, attach
 * and emoji stay on the trailing edge.
 */
export const COMPOSER_COMPACT_INLINE_FIELD_GAP = "gap-2";
/**
 * Compact attach/emoji cluster. Hit areas are already 32px, so gap-1 keeps
 * the glyphs close without stacking hover pills.
 */
export const COMPOSER_COMPACT_TRAILING_ACTIONS_GAP = "gap-1";
/**
 * Right inset for the compact row when attach/emoji sit on the trailing edge.
 * Keep this near the field edge. Compact leading uses pl-2; trailing stays
 * one step wider so two 32px icons do not kiss the rounded corner.
 */
export const COMPOSER_COMPACT_TRAILING_INSET = "pr-3";
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
