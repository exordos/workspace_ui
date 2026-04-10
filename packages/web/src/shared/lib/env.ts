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

const chatMessagesPersistIndexedDb = (() => {
  if (import.meta.env.MODE === "test") return false;
  const explicit = optional("VITE_CHAT_MESSAGES_PERSIST_INDEXEDDB", "");
  if (explicit.trim() !== "") {
    const v = explicit.toLowerCase();
    return v !== "false" && v !== "0";
  }
  const legacy = optional("VITE_CHAT_MESSAGES_SOURCE_INDEXEDDB", "true").toLowerCase();
  return legacy !== "false" && legacy !== "0";
})();

const WORKSPACE_API_ORIGIN_RAW = required("VITE_WORKSPACE_API_ORIGIN");
const ZULIP_REALM_ORIGIN_RAW = optional("VITE_ZULIP_REALM_ORIGIN");
const ZULIP_API_PATH = optional("VITE_ZULIP_API_PATH", "/api/v1");
const WORKSPACE_API_PATH = optional("VITE_WORKSPACE_API_PATH", "/api/v1");
/** Path segment(s) after origin for Workspace REST (OpenAPI paths start with `/v1/`). Default empty. */
const WORKSPACE_REST_API_PATH = optional("VITE_WORKSPACE_REST_API_PATH", "");

function normalizeUserUploadsPathPrefix(raw: string): string {
  const t = raw.trim().replace(/\/+$/, "");
  if (t === "") return "";
  return t.startsWith("/") ? t : `/${t}`;
}

const USER_UPLOADS_PATH_PREFIX = normalizeUserUploadsPathPrefix(
  optional("VITE_USER_UPLOADS_PATH_PREFIX", ""),
);

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
   * Zulip realm origin (host where `/user_uploads/` and the web app live).
   * Defaults to {@link WORKSPACE_API_ORIGIN}. Override when Workspace API and Zulip realm differ.
   * Dev: Vite proxies `/user_uploads/*` to this origin.
   */
  ZULIP_REALM_ORIGIN: ZULIP_REALM_ORIGIN_RAW
    ? cleanOrigin(ZULIP_REALM_ORIGIN_RAW)
    : cleanOrigin(WORKSPACE_API_ORIGIN_RAW),

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
   * Path after origin for Workspace REST (e.g. `/workspace`). Used when stripping gateway
   * suffix from realm URLs for `/user_uploads/` resolution. See `VITE_WORKSPACE_REST_API_PATH`.
   */
  WORKSPACE_REST_API_PATH: WORKSPACE_REST_API_PATH.replace(/\/+$/, ""),

  /**
   * Path inserted before `/user_uploads/` on the server (e.g. `/workspace/v1`).
   * Empty when files are at `{origin}/user_uploads/...`. Set for gateways that mount uploads under a prefix.
   */
  USER_UPLOADS_PATH_PREFIX: USER_UPLOADS_PATH_PREFIX,

  /**
   * Workspace REST API base (Orval paths are `/v1/...`).
   * Default: dev `/workspace`, prod `origin` — no extra suffix so URLs are `{base}/v1/...` (→ `/workspace/v1/...`).
   * Zulip uploads still use {@link WORKSPACE_API_PATH}. Override: `VITE_WORKSPACE_REST_API_PATH`
   * or full `VITE_WORKSPACE_API_BASE_URL`.
   */
  WORKSPACE_API_BASE: (() => {
    const override = optional("VITE_WORKSPACE_API_BASE_URL");
    if (override) return override.replace(/\/+$/, "");
    const origin = cleanOrigin(WORKSPACE_API_ORIGIN_RAW);
    const restPath = WORKSPACE_REST_API_PATH.replace(/\/+$/, "");
    return import.meta.env.DEV ? `/workspace${restPath}` : `${origin}${restPath}`;
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
   * Incoming call modal visual variant.
   * `large` renders centered modal, `compact` keeps top-right toast-like popup.
   * Invalid values fallback to `large`.
   */
  CALL_INCOMING_MODAL_VARIANT: (() => {
    const raw = optional("VITE_CALL_INCOMING_MODAL_VARIANT", "large").toLowerCase();
    return raw === "compact" ? "compact" : "large";
  })() as "large" | "compact",

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

  /**
   * When true, chat messages are written to IndexedDB (write-through cache). UI always uses Zustand.
   * Set `VITE_CHAT_MESSAGES_PERSIST_INDEXEDDB=false` to disable IDB (no disk cache for messages).
   * Legacy: `VITE_CHAT_MESSAGES_SOURCE_INDEXEDDB` is read if `VITE_CHAT_MESSAGES_PERSIST_INDEXEDDB` is unset.
   */
  CHAT_MESSAGES_PERSIST_INDEXEDDB: chatMessagesPersistIndexedDb,

  /**
   * Alias of CHAT_MESSAGES_PERSIST_INDEXEDDB for backward compatibility.
   * Prefer CHAT_MESSAGES_PERSIST_INDEXEDDB in new code.
   */
  CHAT_MESSAGES_SOURCE_INDEXEDDB: chatMessagesPersistIndexedDb,

  /**
   * When true, `[message-flow]` traces appear in the browser console (chat store + IDB + chat page merge).
   * Default: on in development, off in production. Set `VITE_MESSAGE_FLOW_DEBUG=false` to silence in dev.
   */
  MESSAGE_FLOW_DEBUG: (() => {
    if (import.meta.env.MODE === "test") return false;
    const v = optional(
      "VITE_MESSAGE_FLOW_DEBUG",
      import.meta.env.DEV ? "true" : "false",
    ).toLowerCase();
    return v === "true" || v === "1";
  })(),

  /**
   * When true, top bar shows the Calls section shortcut.
   * Build-time — `VITE_TOP_BAR_CALLS_NAV=true` (default: hidden).
   */
  TOP_BAR_CALLS_NAV: (() => {
    const v = optional("VITE_TOP_BAR_CALLS_NAV", "false").toLowerCase();
    return v === "true" || v === "1";
  })(),

  /**
   * When true, top bar shows the Services section shortcut.
   * Build-time — `VITE_TOP_BAR_SERVICES_NAV=true` (default: hidden).
   */
  TOP_BAR_SERVICES_NAV: (() => {
    const v = optional("VITE_TOP_BAR_SERVICES_NAV", "false").toLowerCase();
    return v === "true" || v === "1";
  })(),
} as const;
