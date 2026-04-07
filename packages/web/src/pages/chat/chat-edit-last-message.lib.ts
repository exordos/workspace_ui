import type { MockMessage } from "~/shared/api/zulip.types";

export function resolveLastOwnMessageForEdit(
  messages: readonly MockMessage[],
  currentUserId: number | null,
): MockMessage | null {
  if (currentUserId == null) return null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.sender_id === currentUserId) {
      return message;
    }
  }
  return null;
}
