/**
 * Helpers for focused-message pagination flags in the current chat window.
 */
export function deriveFocusedPaginationFlags(
  messages: readonly { id: number }[],
  focusedMessageId: number | null,
): { hasOlderMessages: boolean; hasNewerMessages: boolean } {
  if (focusedMessageId == null) {
    return { hasOlderMessages: true, hasNewerMessages: false };
  }

  let hasOlderMessages = false;
  let hasNewerMessages = false;
  for (const message of messages) {
    if (message.id < focusedMessageId) hasOlderMessages = true;
    else if (message.id > focusedMessageId) hasNewerMessages = true;
    if (hasOlderMessages && hasNewerMessages) break;
  }
  return { hasOlderMessages, hasNewerMessages };
}
