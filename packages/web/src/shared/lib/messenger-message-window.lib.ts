/**
 * Initial Workspace /messages window sizes for stream vs DM chat views.
 * IndexedDB retention per chat should match these totals so cold cache aligns with API.
 */

/**
 * Focused anchor window for stream chats (`anchor=<message_id>`).
 * We intentionally request both sides so `near` navigation loads context around the anchor,
 * not just history before it.
 */
export const MESSENGER_STREAM_ANCHOR_NUM_BEFORE = 100;
export const MESSENGER_STREAM_ANCHOR_NUM_AFTER = 100;

/** Matches `fetchMessages` (stream/topic, anchor newest). */
export const MESSENGER_STREAM_CHAT_NUM_AFTER = 0;

/**
 * Focused anchor window for DM chats (`anchor=<message_id>`).
 * Keeps context after the anchor for permalink navigation.
 */
export const MESSENGER_DM_ANCHOR_NUM_BEFORE = 60;
export const MESSENGER_DM_ANCHOR_NUM_AFTER = 150;

/** Matches `fetchDmMessages` (anchor newest). */
export const MESSENGER_DM_CHAT_NUM_AFTER = 0;

/** Largest DM window we may load around an anchor (60 + 150). */
export const MESSENGER_DM_INITIAL_WINDOW_TOTAL =
  MESSENGER_DM_ANCHOR_NUM_BEFORE + MESSENGER_DM_ANCHOR_NUM_AFTER;

export function messengerMessageCacheWindowN(context: { type: "stream" } | { type: "dm" }): number {
  return context.type === "stream"
    ? MESSENGER_STREAM_ANCHOR_NUM_BEFORE
    : MESSENGER_DM_INITIAL_WINDOW_TOTAL;
}

export function messengerMessageCacheWindowNForChatKey(chatKey: string): number {
  return chatKey.startsWith("dm:")
    ? MESSENGER_DM_INITIAL_WINDOW_TOTAL
    : MESSENGER_STREAM_ANCHOR_NUM_BEFORE;
}
