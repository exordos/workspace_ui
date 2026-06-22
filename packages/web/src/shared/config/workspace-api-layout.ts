/**
 * Fixed HTTP path layout for Workspace UI (Workspace gateway).
 *
 * Not configurable via `VITE_*`. Optional runtime targets: `VITE_WORKSPACE_API_ORIGIN`,
 * `VITE_WORKSPACE_API_BASE_URL` in `env.ts`.
 *
 */

/** Messenger JSON API path behind Workspace messenger gateway (`/api/messenger/v1/...`). */
export const MESSENGER_API_PATH = "/api/messenger/v1";

/** Native Workspace messenger API path for stream/message writes (`/api/messenger/v1/...`). */
export const MESSENGER_WORKSPACE_API_PATH = "/api/messenger/v1";

/** Gateway REST mount after origin (Orval `/v1/...` → `/workspace/v1/...`). */
export const WORKSPACE_REST_API_PATH = "/workspace";

/** Gateway `/v1` segment: `WORKSPACE_API_PATH` and uploads prefix before `/user_uploads/`. */
export const WORKSPACE_GATEWAY_V1_PATH = "/workspace/v1";

/** Workspace API path on the gateway (same as {@link WORKSPACE_GATEWAY_V1_PATH}). */
export { WORKSPACE_GATEWAY_V1_PATH as WORKSPACE_API_PATH };
