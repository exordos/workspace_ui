import type { MockMessage } from "~/shared/api/messenger.types";
import type { MessageId } from "~/shared/lib/message-id.lib";
import { isMessageFromCurrentUser } from "./message-author.lib";
import type { UserId } from "./user-id.lib";

/** True when the message is unread and not sent by the current user. */
export function isUnreadMessageFromOthers(
  message: MockMessage,
  currentUserId: UserId | null | undefined,
): boolean {
  if (message.read === true) {
    return false;
  }
  if (isMessageFromCurrentUser(message, currentUserId)) {
    return false;
  }
  return true;
}

/** First unread message id from others in chronological order. */
export function resolveFirstUnreadBoundaryMessageId(
  messages: readonly MockMessage[],
  currentUserId: UserId | null | undefined,
): MessageId | undefined {
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
): MessageId | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!;
    if (isUnreadMessageFromOthers(message, currentUserId)) {
      return message.id;
    }
  }
  return undefined;
}
