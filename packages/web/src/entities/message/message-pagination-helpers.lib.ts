/**
 * Helpers for focused-message pagination flags in the current chat window.
 */
import type { MessageId } from "~/shared/lib/message-id.lib";

export function deriveFocusedPaginationFlags(
  messages: readonly { id: MessageId }[],
  focusedMessageId: MessageId | null,
): { hasOlderMessages: boolean; hasNewerMessages: boolean } {
  if (focusedMessageId == null) {
    return { hasOlderMessages: true, hasNewerMessages: false };
  }

  const focusedIndex = messages.findIndex((message) => message.id === focusedMessageId);
  if (focusedIndex < 0) {
    return { hasOlderMessages: false, hasNewerMessages: false };
  }
  return {
    hasOlderMessages: focusedIndex > 0,
    hasNewerMessages: focusedIndex < messages.length - 1,
  };
}
