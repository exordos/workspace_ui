/**
 * Default values for VITE_BRAND_* env vars when unset.
 *
 * Used by runtime `brand.ts`, Vite HTML substitution (`index.html`), and PWA manifest.
 * Single source of truth — do not duplicate these strings elsewhere.
 */

export const BRAND_ENV_DEFAULTS = {
  VITE_BRAND_APP_NAME: "Exordos Workspace",
  VITE_BRAND_SHORT_NAME: "Workspace",
  VITE_BRAND_DESCRIPTION: "Exordos Workspace — smart corporate messenger",
  VITE_BRAND_COPYRIGHT: "© 2026 Exordos Corporation JSC",
  VITE_BRAND_COMPANY: "Exordos",
  VITE_BRAND_APP_ID: "com.exordos.workspace",
  VITE_BRAND_LOGO_URL: "/favicon.svg",
  VITE_BRAND_SUPPORT_URL: "",
  VITE_BRAND_TERMS_URL: "",
  VITE_BRAND_PRIVACY_URL: "",
  VITE_BRAND_DEFAULT_PALETTE: "blue-cold",
  VITE_BRAND_DEFAULT_THEME: "light",
  VITE_BRAND_THEME_COLOR: "#1B1B1D",
  VITE_BRAND_BG_COLOR: "#1B1B1D",
  VITE_BRAND_ACCENT_COLOR: "#FF8438",
  VITE_UNREAD_INDICATOR_COLOR: "#FF5500",
  VITE_BRAND_ALLOW_REGISTRATION: "false",
  VITE_BRAND_SHOW_POWERED_BY: "false",
} as const satisfies Record<string, string>;

export type BrandEnvKey = keyof typeof BRAND_ENV_DEFAULTS;

/** Fills missing VITE_BRAND_* keys in env (and process.env) for Vite HTML / PWA substitution. */
export function applyBrandEnvDefaults(env: Record<string, string>): void {
  for (const [key, value] of Object.entries(BRAND_ENV_DEFAULTS)) {
    if (!env[key]?.trim()) {
      env[key] = value;
      process.env[key] = value;
    }
  }
}

export function brandEnvDefault(key: BrandEnvKey): string {
  return BRAND_ENV_DEFAULTS[key];
}
