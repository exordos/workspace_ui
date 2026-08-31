/**
 * Which conversations this session has already displayed and positioned.
 *
 * A first visit waits for the realtime runtime: the unread anchor is not
 * trustworthy until the runtime has caught up, and positioning on a stale one puts
 * the user in the wrong place. A conversation this session has already positioned
 * owes no such wait — its window is in the store — and paying it again is what
 * makes a revisit blink.
 *
 * The record lives in the module rather than in the chat page because the page is
 * rebuilt on every route change (`key={location.pathname}` in
 * app-route-definitions.tsx), so component state cannot survive the switch this is
 * meant to make cheap.
 *
 * Deliberately small and in memory: a display convenience for the handful of
 * conversations someone is moving between, not a cache of anything. Anything it
 * forgets falls back to the ordinary first-visit path.
 */
import type { MessengerConversationId } from "~/entities/messenger/messenger.types";

const MAX_REMEMBERED_CONVERSATIONS = 12;

const viewedConversations = new Set<MessengerConversationId>();
let currentOwnerKey: string | null = null;

/**
 * Owner switches invalidate everything: the conversation ids belong to the account
 * that is going away. Only an actual change clears anything, so this is safe to
 * call from a page that mounts again on every navigation.
 */
export function setConversationViewMemoryOwner(ownerKey: string | null): void {
  if (currentOwnerKey === ownerKey) return;
  currentOwnerKey = ownerKey;
  viewedConversations.clear();
}

/** Record that the conversation has been displayed and positioned in this session. */
export function markConversationViewed(conversationId: MessengerConversationId | null): void {
  if (conversationId == null) return;
  // Set preserves insertion order, so re-inserting moves the entry to the end.
  viewedConversations.delete(conversationId);
  viewedConversations.add(conversationId);
  while (viewedConversations.size > MAX_REMEMBERED_CONVERSATIONS) {
    const oldest = viewedConversations.values().next();
    if (oldest.done === true) break;
    viewedConversations.delete(oldest.value);
  }
}

/** Drops everything, including which owner it belonged to. For tests. */
export function resetConversationViewMemory(): void {
  viewedConversations.clear();
  currentOwnerKey = null;
}

/** True once the conversation has been displayed and positioned in this session. */
export function hasConversationBeenViewed(conversationId: MessengerConversationId | null): boolean {
  return conversationId != null && viewedConversations.has(conversationId);
}
