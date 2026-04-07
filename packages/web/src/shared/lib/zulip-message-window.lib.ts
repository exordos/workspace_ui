/**
 * Initial Zulip /messages window sizes for stream vs DM chat views.
 * IndexedDB retention per chat should match these totals so cold cache aligns with API.
 */

/** Matches `fetchMessages` (stream/topic, anchor newest). */
export const ZULIP_STREAM_CHAT_NUM_BEFORE = 100;
export const ZULIP_STREAM_CHAT_NUM_AFTER = 0;

/** Matches `fetchDmMessages` (anchor newest). */
export const ZULIP_DM_CHAT_NUM_BEFORE = 60;
export const ZULIP_DM_CHAT_NUM_AFTER = 150;

/** Max messages returned by initial DM fetch (60 + 150). */
export const ZULIP_DM_INITIAL_WINDOW_TOTAL = ZULIP_DM_CHAT_NUM_BEFORE + ZULIP_DM_CHAT_NUM_AFTER;

/** Largest per-chat retention window we persist (DM). */
export const ZULIP_CHAT_MESSAGE_CACHE_MAX_WINDOW = ZULIP_DM_INITIAL_WINDOW_TOTAL;

export function zulipMessageCacheWindowN(context: { type: "stream" } | { type: "dm" }): number {
  return context.type === "stream" ? ZULIP_STREAM_CHAT_NUM_BEFORE : ZULIP_DM_INITIAL_WINDOW_TOTAL;
}

export function zulipMessageCacheWindowNForChatKey(chatKey: string): number {
  return chatKey.startsWith("dm:") ? ZULIP_DM_INITIAL_WINDOW_TOTAL : ZULIP_STREAM_CHAT_NUM_BEFORE;
}
