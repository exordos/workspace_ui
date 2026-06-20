import type { MockMessage } from "~/shared/api/messenger.types";
import { numericUserIdOrNull, type UserId } from "~/shared/lib/user-id.lib";

/** True when the message is unread and not sent by the current user. */
export function isUnreadMessageFromOthers(
  message: MockMessage,
  currentUserId: UserId | null | undefined,
): boolean {
  if (message.flags?.includes("read")) {
    return false;
  }
  const numericCurrentUserId = numericUserIdOrNull(currentUserId);
  if (numericCurrentUserId != null && message.sender_id === numericCurrentUserId) {
    return false;
  }
  return true;
}

/** First unread message id from others in chronological order. */
export function resolveFirstUnreadBoundaryMessageId(
  messages: readonly MockMessage[],
  currentUserId: UserId | null | undefined,
): number | undefined {
  for (const message of messages) {
    if (isUnreadMessageFromOthers(message, currentUserId)) {
      return message.id;
    }
  }
  return undefined;
}

/** Last unread message id from others in chronological order. */
export function resolveLastUnreadBoundaryMessageId(
  messages: readonly MockMessage[],
  currentUserId: UserId | null | undefined,
): number | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!;
    if (isUnreadMessageFromOthers(message, currentUserId)) {
      return message.id;
    }
  }
  return undefined;
}
