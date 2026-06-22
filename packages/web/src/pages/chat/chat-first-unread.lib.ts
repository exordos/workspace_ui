import type { MockMessage } from "~/shared/api/messenger.types";
import {
  resolveFirstUnreadBoundaryMessageId,
  resolveLastUnreadBoundaryMessageId,
} from "~/shared/lib/message-unread-boundary.lib";
import type { UserId } from "~/shared/lib/user-id.lib";

export { resolveFirstUnreadBoundaryMessageId, resolveLastUnreadBoundaryMessageId };

export function countUnreadMessages(
  messages: readonly MockMessage[],
  currentUserId?: UserId | null,
): number {
  let unreadCount = 0;
  for (const message of messages) {
    if (message.read === true) {
      continue;
    }
    if (message.is_own === true) {
      continue;
    }
    unreadCount += 1;
  }
  return unreadCount;
}
