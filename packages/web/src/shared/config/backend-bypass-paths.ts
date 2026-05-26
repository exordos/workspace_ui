/**
 * URL path prefixes that belong to Zulip / gateway backends, not the SPA shell.
 *
 * When the UI is co-hosted on the same origin as the balancer, navigation and fetch
 * to these paths must bypass the SPA (Vite history fallback, Workbox navigateFallback,
 * production nginx `try_files ... /index.html`).
 *
 * See `deploy/nginx/workspace-same-origin.conf.example` for the matching nginx layout.
 */

/**
 * Stable backend prefixes that must reach the Zulip / gateway server, not the SPA.
 *
 * NOTE: `/login` is also handled by the SPA login page (`<Route path="/login">`).
 * Adding it here makes the SPA route unreachable — the bypass will unregister
 * the service worker and reload through the network on `/login` as well.
 * Keep the order in sync with `deploy/nginx/workspace-same-origin.conf.example`.
 *
 * - `/accounts`         — login, registration, social auth (OIDC/SAML/Google/GitHub)
 * - `/api`              — REST API (covers default `VITE_ZULIP_API_PATH=/api/v1`)
 * - `/json`             — legacy session-auth JSON endpoint
 * - `/workspace`        — Workspace gateway REST
 * - `/legacy`           — legacy backend endpoints
 * - `/user_uploads`     — uploaded files
 * - `/user_avatars`     — user avatar files
 * - `/external_content` — image proxy
 * - `/avatar`           — user avatars (Zulip canonical path)
 * - `/thumbnail`        — image thumbnails
 * - `/complete`         — OIDC/social auth completion (`/complete/oidc/`)
 * - `/login`            — top-level login redirect (conflicts with SPA `/login`)
 * - `/logout`           — server-side logout
 * - `/register`         — account registration
 * - `/completed`        — post-deactivation page
 * - `/scim`             — SCIM 2.0 provisioning
 * - `/lk`               — personal account / cabinet routes (`/lk`, `/lk/...`)
 */
export const BACKEND_BYPASS_PATH_PREFIXES = [
  "/accounts",
  "/api",
  "/json",
  "/workspace",
  "/legacy",
  "/user_uploads",
  "/user_avatars",
  "/external_content",
  "/avatar",
  "/thumbnail",
  "/complete",
  "/login",
  "/logout",
  "/register",
  "/completed",
  "/scim",
  "/lk",
] as const;

/**
 * Dev-proxy prefixes are a SUBSET of {@link BACKEND_BYPASS_PATH_PREFIXES}:
 * `/workspace`, `/user_uploads`, `/external_content` already have dedicated
 * `server.proxy` entries in `vite.config.ts` with custom rewrites, so we skip
 * them here to avoid duplicate-key conflicts.
 */
const DEV_PROXY_EXCLUDED_PREFIXES = new Set<string>([
  "/workspace",
  "/user_uploads",
  "/external_content",
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Workbox `navigateFallbackDenylist` entries for co-hosted deployments. */
export function backendBypassNavigateFallbackDenylist(): RegExp[] {
  return BACKEND_BYPASS_PATH_PREFIXES.map(
    (prefix) => new RegExp(`^${escapeRegExp(prefix)}(?:/|$)`),
  );
}

/** First path segment of the configured Zulip API path (e.g. `/api/v1` → `/api`). */
export function zulipApiDevProxyPrefix(zulipApiPath: string): string {
  const trimmed = zulipApiPath.trim().replace(/\/+$/, "");
  const firstSegment = trimmed.split("/").find((part) => part.length > 0);
  return firstSegment != null ? `/${firstSegment}` : "/api";
}

/**
 * Dev-proxy keys for backend paths.
 * Excludes prefixes already covered by dedicated entries in `vite.config.ts`
 * (see {@link DEV_PROXY_EXCLUDED_PREFIXES}). Includes the configured Zulip API prefix.
 */
export function backendBypassDevProxyPrefixes(zulipApiPath: string): string[] {
  const zulipPrefix = zulipApiDevProxyPrefix(zulipApiPath);
  const prefixes = new Set<string>([...BACKEND_BYPASS_PATH_PREFIXES, zulipPrefix]);
  for (const excluded of DEV_PROXY_EXCLUDED_PREFIXES) {
    prefixes.delete(excluded);
  }
  return [...prefixes];
}
