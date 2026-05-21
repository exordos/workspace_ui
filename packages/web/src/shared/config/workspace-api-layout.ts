/**
 * Fixed HTTP path layout for Workspace UI (Workspace gateway).
 *
 * Not configurable via `VITE_*`. Optional runtime targets: `VITE_WORKSPACE_API_ORIGIN`,
 * `VITE_WORKSPACE_API_BASE_URL` in `env.ts`.
 *
 * Historical vanilla Zulip (`/api/v1` for workspace uploads) is documented in ADR-008 only.
 */

/** Zulip JSON API path on the realm host. */
export const ZULIP_API_PATH = "/api/v1";

/** Gateway REST mount after origin (Orval `/v1/...` → `/workspace/v1/...`). */
export const WORKSPACE_REST_API_PATH = "/workspace";

/** Gateway `/v1` segment: `WORKSPACE_API_PATH` and uploads prefix before `/user_uploads/`. */
export const WORKSPACE_GATEWAY_V1_PATH = "/workspace/v1";

/** Workspace API path on the gateway (same as {@link WORKSPACE_GATEWAY_V1_PATH}). */
export const WORKSPACE_API_PATH = WORKSPACE_GATEWAY_V1_PATH;

/** @deprecated Prefer {@link WORKSPACE_GATEWAY_V1_PATH}. */
export const USER_UPLOADS_PATH_PREFIX = WORKSPACE_GATEWAY_V1_PATH;
