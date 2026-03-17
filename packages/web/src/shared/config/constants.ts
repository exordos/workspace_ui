/**
 * Application constants.
 *
 * Environment-derived values centralized in `~/lib/env`.
 * This file re-exports them for backward compatibility and adds non-env constants.
 */
import { env } from "~/shared/lib/env";

export const SCROLL_AREA_CLASS =
  "scrollbar scrollbar-thin scrollbar-thumb-border-subtle scrollbar-track-bg scrollbar-thumb-rounded-md";

export const JITSI_MEET_DOMAIN = env.JITSI_MEET_DOMAIN;
export const JITSI_MEET_BASE_URL = env.JITSI_MEET_BASE_URL;
export const WORKSPACE_ORIGIN = env.WORKSPACE_API_ORIGIN;
export const WORKSPACE_UPLOADS_ORIGIN = env.WORKSPACE_UPLOADS_ORIGIN;
