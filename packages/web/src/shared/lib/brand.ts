/**
 * White-label brand configuration.
 *
 * Single source of truth for ALL brand-specific values.
 * Customize via VITE_BRAND_* env vars — zero code changes for new brands.
 *
 * Usage:
 *   import { brand } from "~/lib/brand";
 *
 *   document.title = brand.appName;
 *   <img src={brand.logoUrl} alt={brand.appName} />
 *   <a href={brand.supportUrl}>Help</a>
 */

import { brandEnvDefault, type BrandEnvKey } from "./brand-defaults.lib";

const opt = (key: BrandEnvKey): string => {
  const v = import.meta.env[key] as string | undefined;
  const trimmed = v?.trim();
  return trimmed != null && trimmed.length > 0 ? trimmed : brandEnvDefault(key);
};

export const brand = {
  /** Application name (displayed in title bar, PWA, about). */
  appName: opt("VITE_BRAND_APP_NAME"),

  /** Short application name (for PWA, desktop shortcuts). */
  appShortName: opt("VITE_BRAND_SHORT_NAME"),

  /** Application description. */
  appDescription: opt("VITE_BRAND_DESCRIPTION"),

  /** Copyright line. */
  copyright: opt("VITE_BRAND_COPYRIGHT"),

  /** Company / organization name. */
  companyName: opt("VITE_BRAND_COMPANY"),

  /** App ID for Electron and PWA (reverse domain). */
  appId: opt("VITE_BRAND_APP_ID"),

  /** Logo URL (SVG preferred). Used on login page, about screen. */
  logoUrl: opt("VITE_BRAND_LOGO_URL"),

  /** Support / help URL. */
  supportUrl: opt("VITE_BRAND_SUPPORT_URL"),

  /** Terms of service URL. */
  termsUrl: opt("VITE_BRAND_TERMS_URL"),

  /** Privacy policy URL. */
  privacyUrl: opt("VITE_BRAND_PRIVACY_URL"),

  /** Default theme palette ID. Must match a registered palette. */
  defaultPaletteId: opt("VITE_BRAND_DEFAULT_PALETTE"),

  /** Default theme mode. */
  defaultThemeMode: opt("VITE_BRAND_DEFAULT_THEME") as "light" | "dark",

  /** PWA theme color (hex). */
  themeColor: opt("VITE_BRAND_THEME_COLOR"),

  /** PWA background color (hex). */
  backgroundColor: opt("VITE_BRAND_BG_COLOR"),

  /** Accent color for brand highlights. */
  accentColor: opt("VITE_BRAND_ACCENT_COLOR"),

  /** Unread dot on favicon / tray (brighter than accent for small sizes). */
  unreadIndicatorColor: opt("VITE_UNREAD_INDICATOR_COLOR"),

  /** Auto-update server URL (Electron). */
  updateServerUrl: opt("VITE_BRAND_UPDATE_URL"),

  /** Public registration enabled. */
  allowRegistration: opt("VITE_BRAND_ALLOW_REGISTRATION") === "true",

  /** Show "Powered by" in footer. */
  showPoweredBy: opt("VITE_BRAND_SHOW_POWERED_BY") === "true",
} as const;

export type Brand = typeof brand;
