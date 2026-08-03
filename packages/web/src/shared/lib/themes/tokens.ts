/**
 * Design token schema.
 *
 * Each palette defines values for ALL tokens. Tailwind reads them via CSS variables.
 * To create a new palette: add a new object satisfying `PaletteTokens` and register it.
 */

export interface PaletteTokens {
  /** Surfaces */
  bg: string;
  "bg-elevated": string;
  "card-bg": string;
  "card-bg-active": string;
  "text-field-bg": string;

  /** Typography */
  "text-primary": string;
  "text-secondary": string;
  "text-muted": string;

  /** Brand */
  accent: string;
  "accent-soft": string;
  "on-accent": string;
  danger: string;

  /** Borders */
  "border-subtle": string;

  /** Sidebar */
  "sidebar-bg": string;
  "sidebar-item-hover": string;
  "sidebar-sender": string;
  "sidebar-unread": string;

  /** Composer */
  "composer-outer": string;
  "composer-send": string;
  "composer-icon": string;

  /** Messages */
  "msg-bg": string;
  "msg-own-bg": string;
  "msg-time": string;
  "msg-call-bg": string;
  "msg-selected": string;

  /** Icons */
  "icon-base": string;
  "icon-disable": string;
  "icon-hover": string;
  "icon-active": string;

  /** Notice / Badges */
  "notice-base": string;
  "notice-disable": string;
  "badge-bg": string;
  "badge-text": string;

  /** Call */
  "call-bg": string;
  "call-green": string;
  "call-red": string;

  /** Search */
  "search-bg": string;
  "search-hint": string;

  /** Indicators */
  "indicator-yellow": string;
  "indicator-pink": string;
  "indicator-purple": string;
  "indicator-green": string;
  "indicator-orange": string;
  "indicator-blue": string;
  "indicator-red": string;
}

export interface ThemePalette {
  id: string;
  name: string;
  light: PaletteTokens;
  dark: PaletteTokens;
}

export type ThemeMode = "light" | "dark" | "system";
