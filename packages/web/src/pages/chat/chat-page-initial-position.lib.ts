/**
 * When the message list may take its scroll position.
 *
 * A first visit waits for the realtime runtime: the unread anchor is only
 * trustworthy once the runtime has caught up, and positioning on a stale one
 * puts the user in the wrong place. A conversation this session has already
 * positioned owes no such wait — its window is in the store and its position is
 * remembered, so waiting again is what makes a revisit blink.
 */
export interface ResolveInitialPositionReadyInput {
  hasRuntimeContext: boolean;
  hasConversationWindow: boolean;
  /** Navigation aimed at a specific message carries its own anchor. */
  hasFocusTarget: boolean;
  realtimeReady: boolean;
  /** The conversation has been displayed and positioned earlier in this session. */
  viewedBefore: boolean;
}

export function resolveInitialPositionReady({
  hasRuntimeContext,
  hasConversationWindow,
  hasFocusTarget,
  realtimeReady,
  viewedBefore,
}: ResolveInitialPositionReadyInput): boolean {
  if (!hasRuntimeContext || !hasConversationWindow) return false;
  return hasFocusTarget || viewedBefore || realtimeReady;
}
