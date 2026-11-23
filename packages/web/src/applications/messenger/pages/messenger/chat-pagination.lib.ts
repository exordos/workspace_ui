interface MessageWithId {
  id: number;
}

export interface FocusedPaginationFlags {
  hasOlderMessages: boolean;
  hasNewerMessages: boolean;
}

export interface BoundaryLoadState {
  isLoadingMore: boolean;
  hasBoundaryMessages: boolean;
  messagesLength: number;
}

/**
 * Derives pagination flags for a focused message anchor.
 * Without an anchor, defaults preserve regular chat behavior (older=true/newer=false).
 */
export function deriveFocusedPaginationFlags(
  messages: readonly MessageWithId[],
  focusedMessageId: number | null,
): FocusedPaginationFlags {
  if (focusedMessageId == null) {
    return { hasOlderMessages: true, hasNewerMessages: false };
  }

  let hasOlderMessages = false;
  let hasNewerMessages = false;

  for (const message of messages) {
    if (message.id < focusedMessageId) {
      hasOlderMessages = true;
    } else if (message.id > focusedMessageId) {
      hasNewerMessages = true;
    }

    if (hasOlderMessages && hasNewerMessages) break;
  }

  return { hasOlderMessages, hasNewerMessages };
}

/**
 * Guard to prevent boundary pagination calls when no anchor/messages are available
 * or when a previous boundary request is still in flight.
 */
export function shouldLoadBoundaryPage(state: BoundaryLoadState): boolean {
  return !state.isLoadingMore && state.hasBoundaryMessages && state.messagesLength > 0;
}
