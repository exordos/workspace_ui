/** Cache can paint immediately; automatic positioning also needs this opening's server window. */
export interface ResolveInitialPositionReadyInput {
  hasRuntimeContext: boolean;
  hasConversationWindow: boolean;
  /** Navigation aimed at a specific message carries its own anchor. */
  hasFocusTarget: boolean;
  realtimeReady: boolean;
  /** The conversation has been displayed and positioned earlier in this session. */
  viewedBefore: boolean;
  /** The current opening has applied its server window, independently of cache loading. */
  historyReady?: boolean;
}

export function resolveInitialPositionReady({
  hasRuntimeContext,
  hasConversationWindow,
  hasFocusTarget,
  realtimeReady,
  viewedBefore,
  historyReady = true,
}: ResolveInitialPositionReadyInput): boolean {
  if (!hasRuntimeContext || !hasConversationWindow) return false;
  return hasFocusTarget || (historyReady && (viewedBefore || realtimeReady));
}
