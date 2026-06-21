import type { MessageId } from "~/shared/lib/message-id.lib";

interface MessageWithId {
  id: MessageId;
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
  focusedMessageId: MessageId | null,
): FocusedPaginationFlags {
  if (focusedMessageId == null) {
    return { hasOlderMessages: true, hasNewerMessages: false };
  }

  const focusedIndex = messages.findIndex((message) => message.id === focusedMessageId);
  if (focusedIndex < 0) {
    return { hasOlderMessages: messages.length > 0, hasNewerMessages: false };
  }

  return {
    hasOlderMessages: focusedIndex > 0,
    hasNewerMessages: focusedIndex < messages.length - 1,
  };
}

/**
 * Guard to prevent boundary pagination calls when no anchor/messages are available
 * or when a previous boundary request is still in flight.
 */
export function shouldLoadBoundaryPage(state: BoundaryLoadState): boolean {
  return !state.isLoadingMore && state.hasBoundaryMessages && state.messagesLength > 0;
}
