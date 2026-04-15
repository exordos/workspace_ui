/**
 * Default HTTP path layout for Workspace UI against the Workspace gateway vs vanilla Zulip.
 *
 * - **Gateway-first** (defaults in {@link WORKSPACE_HTTP_PATH_DEFAULTS}): Workspace REST and
 *   upload-related URL construction use `/workspace/v1` on the gateway host; Zulip JSON API on
 *   the realm host stays `/api/v1` unless overridden.
 * - **Vanilla Zulip**: set `VITE_WORKSPACE_API_PATH=/api/v1` (and keep other paths default) or use
 *   {@link VANILLA_ZULIP_HTTP_PATH_DEFAULTS} values explicitly — see `docs/adr/008-workspace-http-path-defaults.md`.
 */

/** Historical defaults: single-host Zulip, `/api/v1` for both API and upload-origin construction. */
export const VANILLA_ZULIP_HTTP_PATH_DEFAULTS = {
  zulipApiPath: "/api/v1",
  workspaceApiPath: "/api/v1",
  workspaceRestApiPath: "",
  userUploadsPathPrefix: "",
} as const;

/**
 * Workspace gateway: REST under `/workspace/v1/...` on gateway; realm Zulip API still `/api/v1`
 * when talking to the canonical realm URL.
 */
export const WORKSPACE_GATEWAY_HTTP_PATH_DEFAULTS = {
  zulipApiPath: "/api/v1",
  workspaceApiPath: "/workspace/v1",
  workspaceRestApiPath: "",
  userUploadsPathPrefix: "",
} as const;

/** Applied when corresponding `VITE_*` env vars are unset (empty). */
export const WORKSPACE_HTTP_PATH_DEFAULTS = WORKSPACE_GATEWAY_HTTP_PATH_DEFAULTS;
