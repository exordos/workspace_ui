/** Shared Tailwind class strings for composer toolbar and mode tabs. */

/** Formatting toolbar icon/text buttons — uses shared icon hover contract (see app.styles.css). */
export const TOOLBAR_BTN = "composer-toolbar-btn flex h-7 w-7 items-center justify-center";
/** Text glyphs (B, I, S, 1.) — button hit area unchanged (h-7 w-7). */
export const TOOLBAR_GLYPH = "select-none text-[15px] font-medium leading-none text-current";
/** Quote glyph (>) — punctuation metrics sit low; nudge up for optical centering in the button. */
export const TOOLBAR_QUOTE_GLYPH =
  "select-none inline-block -translate-y-px text-[15px] font-semibold leading-none text-current";
/** Mono glyphs (||) — same size as TOOLBAR_GLYPH. */
export const TOOLBAR_MONO_GLYPH = "select-none font-mono text-[15px] leading-none text-current";
/** Wider mono labels (</>, { }) — smaller so they fit the 28×28 px button. */
export const TOOLBAR_MONO_COMPACT_GLYPH =
  "select-none font-mono text-[13px] leading-none text-current";
/** SVG icons in the formatting toolbar row. */
export const TOOLBAR_ICON_SIZE = 18;
/** links.svg has extra viewBox padding — render slightly larger for visual parity. */
export const TOOLBAR_LINK_ICON_SIZE = 21;
/** AI sparkles trigger — ~50% larger than the legacy 14px default. */
export const TOOLBAR_AI_ICON_SIZE = 18;
/**
 * Heavier visual weight for thin outline-style toolbar icons (links, attach, phone, pen).
 * Composer-only — does not change shared SVG assets used elsewhere.
 */
export const TOOLBAR_ICON_EMPHASIS_CLASS =
  "[&_path]:stroke-current [&_path]:[stroke-width:1px] [&_path]:[paint-order:stroke_fill]";
/** Write/Preview toggle — opt out of global svg-only button colors (see app.styles.css). */
export const MODE_TAB_BTN =
  "composer-mode-tab-btn flex h-7 w-7 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft";
/** Active tab: accent pill + icon-active (same token as inactive hover). */
export const MODE_TAB_ACTIVE = "bg-accent text-icon-active";
export const MODE_TAB_INACTIVE =
  "text-composer-icon hover:bg-bg-elevated/60 hover:text-icon-active";
