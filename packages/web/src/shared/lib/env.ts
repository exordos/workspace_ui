/**
 * Centralized environment variable access.
 *
 * Single source of truth for all env vars.
 * Validates required vars on import. Falls back to defaults for optional vars.
 *
 * Usage:
 *   import { env } from "~/lib/env";
 *   console.log(env.WORKSPACE_API_ORIGIN);
 *   console.log(env.JITSI_MEET_DOMAIN);
 */

function required(key: string): string {
  const value = import.meta.env[key] as string | undefined;
  if (!value?.trim()) {
    const msg = `Missing required env var: ${key}. Check packages/web/.env`;
    if (import.meta.env.PROD) {
      console.error(msg);
    }
    return "";
  }
  return value.trim();
}

function optional(key: string, fallback = ""): string {
  const value = import.meta.env[key] as string | undefined;
  const trimmed = value?.trim();
  return trimmed != null && trimmed.length > 0 ? trimmed : fallback;
}

function cleanOrigin(url: string): string {
  return url.replace(/\/api\/v1\/?$/, "").replace(/\/+$/, "");
}

const WORKSPACE_API_ORIGIN_RAW = required("VITE_WORKSPACE_API_ORIGIN");
const ZULIP_API_PATH = optional("VITE_ZULIP_API_PATH", "/api/v1");
const WORKSPACE_API_PATH = optional("VITE_WORKSPACE_API_PATH", "/api/v1");

export const env = {
  /** `true` in development, `false` in production build. Vite built-in. */
  DEV: import.meta.env.DEV,

  /** `true` in production build. Vite built-in. */
  PROD: import.meta.env.PROD,

  /** Vite mode: "development" | "production" | custom. */
  MODE: import.meta.env.MODE,

  /**
   * Workspace/Zulip API origin (e.g. `https://zulip.example.com`).
   * Used as proxy target in dev, direct URL in prod.
   * REQUIRED.
   */
  WORKSPACE_API_ORIGIN: cleanOrigin(WORKSPACE_API_ORIGIN_RAW),

  /**
   * Zulip API path (default `/api/v1`).
   * Override via `VITE_ZULIP_API_PATH` for custom API gateways.
   */
  ZULIP_API_PATH: ZULIP_API_PATH,

  /**
   * Workspace API path (default `/api/v1`).
   * Override via `VITE_WORKSPACE_API_PATH` for custom backend paths.
   */
  WORKSPACE_API_PATH: WORKSPACE_API_PATH,

  /**
   * Workspace API base URL: origin + path.
   * In dev: proxied through Vite (`/workspace-api{path}`).
   * In prod: direct (`https://zulip.example.com{path}`).
   * Full override: `VITE_WORKSPACE_API_BASE_URL`.
   */
  WORKSPACE_API_BASE: (() => {
    const override = optional("VITE_WORKSPACE_API_BASE_URL");
    if (override) return override.replace(/\/+$/, "");
    const origin = cleanOrigin(WORKSPACE_API_ORIGIN_RAW);
    return import.meta.env.DEV
      ? `/workspace-api${WORKSPACE_API_PATH}`
      : `${origin}${WORKSPACE_API_PATH}`;
  })(),

  /**
   * Workspace uploads origin for absolute URLs in messages.
   * e.g. `https://zulip.example.com/api/v1`
   */
  WORKSPACE_UPLOADS_ORIGIN: (() => {
    const origin = cleanOrigin(WORKSPACE_API_ORIGIN_RAW);
    return origin ? `${origin}${WORKSPACE_API_PATH}` : "";
  })(),

  /**
   * Jitsi Meet domain without protocol (e.g. `meet.example.com`).
   * Used for JitsiMeeting component `domain` prop and link detection.
   * Optional — video calls disabled if empty.
   */
  JITSI_MEET_DOMAIN: optional("VITE_JITSI_MEET_DOMAIN"),

  /** Jitsi Meet full URL (e.g. `https://meet.example.com`). Empty if domain not set. */
  JITSI_MEET_BASE_URL: (() => {
    const domain = optional("VITE_JITSI_MEET_DOMAIN");
    return domain ? `https://${domain}` : "";
  })(),

  /**
   * CDN base URL for static assets (e.g. `https://cdn.example.com/workspace`).
   * When set, all JS/CSS/image assets are loaded from CDN instead of origin.
   * Vite handles this via `base` config — no code changes needed in components.
   * Optional — defaults to same origin.
   */
  CDN_URL: optional("VITE_CDN_URL"),

  /** Resolved base path: CDN URL with trailing /, "./" for Electron, or "/". */
  BASE_URL: import.meta.env.BASE_URL,

  /**
   * Calendar iframe URL override.
   * Defaults to same-origin `/embeds/calendar-placeholder.html` when empty.
   */
  CALENDAR_EMBED_URL: optional("VITE_CALENDAR_EMBED_URL"),

  /**
   * Mail iframe URL override.
   * Defaults to same-origin `/embeds/mail-placeholder.html` when empty.
   */
  MAIL_EMBED_URL: optional("VITE_MAIL_EMBED_URL"),
} as const;
