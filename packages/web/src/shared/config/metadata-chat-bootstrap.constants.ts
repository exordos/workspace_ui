/**
 * Metadata-first sidebar bootstrap defaults (formerly gated by VITE_* env flags).
 */

/** Max messages in stream sidebar preview batch (delta / is:unread / recent fallback). */
export const METADATA_STREAM_PREVIEW_MESSAGE_LIMIT = 5000;

/** Per-channel lazy sidebar topic hydrate: max messages from GET /messages narrow stream. */
export const STREAM_SIDEBAR_TOPIC_HYDRATE_LIMIT = 100;

/**
 * When true, loads deep DM history batches after bootstrap instead of
 * `recent_private_conversations` preview hydration only.
 */
export const METADATA_DM_BACKFILL_ENABLED = false;
