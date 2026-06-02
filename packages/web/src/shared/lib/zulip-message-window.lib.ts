/**
 * Initial Zulip /messages window sizes for stream vs DM chat views.
 * IndexedDB retention per chat should match these totals so cold cache aligns with API.
 */

/**
 * Focused anchor window for stream chats (`anchor=<message_id>`).
 * We intentionally request both sides so `near` navigation loads context around the anchor,
 * not just history before it.
 */
export const ZULIP_STREAM_ANCHOR_NUM_BEFORE = 100;
export const ZULIP_STREAM_ANCHOR_NUM_AFTER = 100;

/** Matches `fetchMessages` (stream/topic, anchor newest). */
export const ZULIP_STREAM_CHAT_NUM_AFTER = 0;

/**
 * Focused anchor window for DM chats (`anchor=<message_id>`).
 * Keeps context after the anchor for permalink navigation.
 */
export const ZULIP_DM_ANCHOR_NUM_BEFORE = 60;
export const ZULIP_DM_ANCHOR_NUM_AFTER = 150;

/** Matches `fetchDmMessages` (anchor newest). */
export const ZULIP_DM_CHAT_NUM_AFTER = 0;

/** Largest DM window we may load around an anchor (60 + 150). */
export const ZULIP_DM_INITIAL_WINDOW_TOTAL = ZULIP_DM_ANCHOR_NUM_BEFORE + ZULIP_DM_ANCHOR_NUM_AFTER;

export function zulipMessageCacheWindowN(context: { type: "stream" } | { type: "dm" }): number {
  return context.type === "stream" ? ZULIP_STREAM_ANCHOR_NUM_BEFORE : ZULIP_DM_INITIAL_WINDOW_TOTAL;
}

export function zulipMessageCacheWindowNForChatKey(chatKey: string): number {
  return chatKey.startsWith("dm:") ? ZULIP_DM_INITIAL_WINDOW_TOTAL : ZULIP_STREAM_ANCHOR_NUM_BEFORE;
}
