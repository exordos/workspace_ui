/**
 * Centralized environment variable access.
 *
 * Single source of truth for core env-derived config.
 * Optional vars fall back to defaults. `VITE_WORKSPACE_API_ORIGIN` is optional (multi-org;
 * instance realm and dev `X-Workspace-Dev-Target-Origin` supply targets at runtime).
 *
 * Usage:
 *   import { env } from "~/lib/env";
 *   console.log(env.WORKSPACE_API_ORIGIN);
 *   console.log(env.JITSI_MEET_DOMAIN);
 */

import { devWorkspaceBrowserMountPath } from "~/shared/config/dev-workspace-org-proxy";
import {
  WORKSPACE_API_PATH,
  WORKSPACE_GATEWAY_V1_PATH,
  WORKSPACE_REST_API_PATH,
  ZULIP_API_PATH,
} from "~/shared/config/workspace-api-layout";

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

const avatarPersistIndexedDb = (() => {
  if (import.meta.env.MODE === "test") return false;
  return parseBooleanEnvFlag(optional("VITE_AVATAR_PERSIST_INDEXEDDB", "true"), true);
})();

function parseBooleanEnvFlag(value: string, fallback: boolean): boolean {
  // Что делает: единообразно парсит true/false и 1/0 из env, чтобы флаги не вели себя по-разному в разных местах.
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) return fallback;
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  return fallback;
}

const WORKSPACE_API_ORIGIN_RAW = optional("VITE_WORKSPACE_API_ORIGIN", "");

/** Rare: Zulip webroot is bare origin but uploads are only under {@link WORKSPACE_GATEWAY_V1_PATH}. */
const USER_UPLOADS_PREFIX_ON_ZULIP_REALM = parseBooleanEnvFlag(
  optional("VITE_USER_UPLOADS_PREFIX_ON_ZULIP_REALM", ""),
  false,
);

export const env = {
  /** `true` in development, `false` in production build. Vite built-in. */
  DEV: import.meta.env.DEV,

  /** `true` in production build. Vite built-in. */
  PROD: import.meta.env.PROD,

  /** Vite mode: "development" | "production" | custom. */
  MODE: import.meta.env.MODE,

  /**
   * Optional default Workspace/Zulip API origin (e.g. `https://zulip.example.com`).
   * Dev: optional static Vite `server.proxy` target; multi-org uses instance + `X-Workspace-Dev-Target-Origin`
   * for `/workspace` and `/user_uploads` fetches.
   * Prod: use with `VITE_WORKSPACE_API_BASE_URL` or instance-derived bases when empty.
   */
  WORKSPACE_API_ORIGIN: cleanOrigin(WORKSPACE_API_ORIGIN_RAW),

  /** Zulip JSON API path (`/api/v1`). Fixed — `~/shared/config/workspace-api-layout`. */
  ZULIP_API_PATH,

  /** Workspace gateway API path (`/workspace/v1`). Fixed — same module. */
  WORKSPACE_API_PATH,

  /**
   * Path after origin for Workspace REST (`/workspace`). Fixed — see `~/shared/config/workspace-api-layout`.
   */
  WORKSPACE_REST_API_PATH,

  /** Path before `/user_uploads/` on the gateway. Fixed — {@link WORKSPACE_GATEWAY_V1_PATH}. */
  USER_UPLOADS_PATH_PREFIX: WORKSPACE_GATEWAY_V1_PATH,

  /**
   * When true, append {@link WORKSPACE_GATEWAY_V1_PATH} even if the realm base equals the upload site
   * origin (no gateway tail was stripped). Default false — canonical Zulip serves `/user_uploads/`
   * at the realm root.
   */
  USER_UPLOADS_PREFIX_ON_ZULIP_REALM: USER_UPLOADS_PREFIX_ON_ZULIP_REALM,

  /**
   * Workspace REST API base (Orval paths are `/v1/...`).
   * Default: dev `/workspace`, prod `origin` — no extra suffix so URLs are `{base}/v1/...` (→ `/workspace/v1/...`).
   * Zulip uploads still use {@link WORKSPACE_API_PATH}. Override: `VITE_WORKSPACE_API_BASE_URL` only.
   */
  WORKSPACE_API_BASE: (() => {
    const override = optional("VITE_WORKSPACE_API_BASE_URL");
    if (override) return override.replace(/\/+$/, "");
    const origin = cleanOrigin(WORKSPACE_API_ORIGIN_RAW);
    const restPath = WORKSPACE_REST_API_PATH;
    if (import.meta.env.DEV) {
      return devWorkspaceBrowserMountPath(restPath).replace(/\/+$/, "");
    }
    return origin ? `${origin}${restPath}` : restPath;
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
   * Build-time fallback when the server does not return a Jitsi URL in `POST /api/v1/register`.
   * Runtime resolution: Zulip register `jitsi_server_url` / realm+server fields → this env →
   * link detection still accepts public `meet.jit.si` (see `~/shared/lib/jitsi`).
   */
  JITSI_MEET_DOMAIN: optional("VITE_JITSI_MEET_DOMAIN"),

  /** `https://` + {@link JITSI_MEET_DOMAIN}, or empty when the env domain is unset. */
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

  /**
   * When true, chat messages are written to IndexedDB (write-through cache). UI always uses Zustand.
   * Set `VITE_CHAT_MESSAGES_PERSIST_INDEXEDDB=false` to disable IDB (no disk cache for messages).
   * Legacy: `VITE_CHAT_MESSAGES_SOURCE_INDEXEDDB` is read if `VITE_CHAT_MESSAGES_PERSIST_INDEXEDDB` is unset.
   */
  CHAT_MESSAGES_PERSIST_INDEXEDDB: chatMessagesPersistIndexedDb,

  /**
   * When true, avatar images are cached as blobs in IndexedDB (LRU per instance).
   * Set `VITE_AVATAR_PERSIST_INDEXEDDB=false` to disable.
   */
  AVATAR_PERSIST_INDEXEDDB: avatarPersistIndexedDb,

  /**
   * When true, `[message-flow]` and `[scroll-read]` traces appear in the browser console (chat store,
   * IDB, chat page merge, scroll offsets, mark-as-read). Default: on in dev. Set `false` to silence.
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
   * When true, `[chat-list-flow]` traces appear in the browser console (IndexedDB snapshot, GET /messages
   * for sidebar bootstrap, Zustand chat-list updates, IDB persist debounce).
   * Default: on in development, off in production. Set `VITE_CHAT_LIST_FLOW_DEBUG=false` to silence in dev.
   */
  CHAT_LIST_FLOW_DEBUG: (() => {
    if (import.meta.env.MODE === "test") return false;
    const v = optional(
      "VITE_CHAT_LIST_FLOW_DEBUG",
      import.meta.env.DEV ? "true" : "false",
    ).toLowerCase();
    return v === "true" || v === "1";
  })(),

  /**
   * When true, `[sidebar-unread]` traces appear in the console (register reconcile, realtime bumps,
   * mark-as-read decrements, MessageList dispatch). Default: on in dev.
   */
  SIDEBAR_UNREAD_DEBUG: (() => {
    if (import.meta.env.MODE === "test") return false;
    const v = optional(
      "VITE_SIDEBAR_UNREAD_DEBUG",
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
