import type { MockMessage } from "~/shared/api/zulip.types";

function isUnreadFromOthers(
  message: MockMessage,
  currentUserId: number | null | undefined,
): boolean {
  if (message.flags?.includes("read")) {
    return false;
  }
  if (currentUserId != null && message.sender_id === currentUserId) {
    return false;
  }
  return true;
}

/** First unread message id from others in chronological order. */
export function resolveFirstUnreadBoundaryMessageId(
  messages: readonly MockMessage[],
  currentUserId: number | null | undefined,
): number | undefined {
  for (const message of messages) {
    if (isUnreadFromOthers(message, currentUserId)) {
      return message.id;
    }
  }
  return undefined;
}

/** Last unread message id from others in chronological order. */
export function resolveLastUnreadBoundaryMessageId(
  messages: readonly MockMessage[],
  currentUserId: number | null | undefined,
): number | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!;
    if (isUnreadFromOthers(message, currentUserId)) {
      return message.id;
    }
  }
  return undefined;
}
