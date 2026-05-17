/**
 * Application constants.
 *
 * Environment-derived values centralized in `~/lib/env`.
 * This file re-exports them for backward compatibility and adds non-env constants.
 *
 * Layout pixel values that appear in Tailwind are duplicated in
 * `packages/web/tailwind.config.ts` (named theme keys) — keep both in sync
 * (e.g. `APP_SHELL_MIN_WIDTH_PX` ↔ `min-w-app-shell-min`).
 */
import { env } from "~/shared/lib/env";

export const SCROLL_AREA_CLASS =
  "scrollbar scrollbar-thin scrollbar-thumb-border-subtle scrollbar-track-bg scrollbar-thumb-rounded-md";

export const JITSI_MEET_DOMAIN = env.JITSI_MEET_DOMAIN;
export const JITSI_MEET_BASE_URL = env.JITSI_MEET_BASE_URL;
export const CALL_INCOMING_MODAL_VARIANT = env.CALL_INCOMING_MODAL_VARIANT;
export const WORKSPACE_ORIGIN = env.WORKSPACE_API_ORIGIN;
export const WORKSPACE_UPLOADS_ORIGIN = env.WORKSPACE_UPLOADS_ORIGIN;
export const IS_CONNECTION_DIAGNOSTICS_ENABLED = env.DEV;

// ---
// Timing
// ---

/** Search modal query debounce; same coalescing window as multi-org unread refresh. */
export const SEARCH_INPUT_DEBOUNCE_MS = 300;

/** Default debounce when coalescing unread refresh from inactive-instance event streams. */
export const MULTI_ORG_UNREAD_REFRESH_DEBOUNCE_MS = SEARCH_INPUT_DEBOUNCE_MS;

/** Jitsi Meet API: poll interval for participant list display in the call UI. */
export const JITSI_PARTICIPANTS_POLL_MS = 5000;

/**
 * Hard cap for each Zulip HTTP request (until response headers + JSON body read via fetch).
 * Retries receive a fresh timeout window. Does not apply to GET long-poll `.../events`.
 */
export const ZULIP_API_FETCH_TIMEOUT_MS = 60_000;

// ---
// Layout
// ---

/** Main workspace inner row max width — mirror Tailwind `max-w-main-workspace`. */
export const MAIN_WORKSPACE_MAX_WIDTH_PX = 1920;

/** Minimum shell height — mirror Tailwind `min-h-app-shell`. */
export const LAYOUT_MIN_HEIGHT_PX = 400;

/**
 * Reference width for the primary content column (`max-w-narrow-page` / Tailwind).
 * Not the minimum window width — use `APP_SHELL_MIN_WIDTH_PX` for the root shell floor.
 */
export const DESKTOP_MIN_VIEWPORT_WIDTH_PX = 1200;

/**
 * Max width for routed page roots aligned with the reference column width.
 * One pixel under `DESKTOP_MIN_VIEWPORT_WIDTH_PX` — mirror Tailwind `max-w-narrow-page`.
 */
export const NARROW_PAGE_MAX_WIDTH_PX = DESKTOP_MIN_VIEWPORT_WIDTH_PX - 1;

/** Minimum root app shell width — mirror Tailwind `min-w-app-shell-min`. */
export const APP_SHELL_MIN_WIDTH_PX = 360;

// ---
// Messenger defaults
// ---

/** Default Zulip stream slug used when no last-opened messenger chat is saved. */
export const DEFAULT_MESSENGER_STREAM_SLUG = "general";

/** Debounce for persisting the last opened messenger chat to localStorage. */
export const LAST_MESSENGER_ROUTE_PERSIST_DEBOUNCE_MS = 300;
