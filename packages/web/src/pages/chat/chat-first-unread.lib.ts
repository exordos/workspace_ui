import type { MockMessage } from "~/shared/api/messenger.types";
import {
  resolveFirstUnreadBoundaryMessageId,
  resolveLastUnreadBoundaryMessageId,
} from "~/shared/lib/message-unread-boundary.lib";
import { numericUserIdOrNull, type UserId } from "~/shared/lib/user-id.lib";

export { resolveFirstUnreadBoundaryMessageId, resolveLastUnreadBoundaryMessageId };

export function countUnreadMessages(
  messages: readonly MockMessage[],
  currentUserId?: UserId | null,
): number {
  const numericCurrentUserId = numericUserIdOrNull(currentUserId);
  let unreadCount = 0;
  for (const message of messages) {
    if (message.flags?.includes("read")) {
      continue;
    }
    if (numericCurrentUserId != null && message.sender_id === numericCurrentUserId) {
      continue;
    }
    unreadCount += 1;
  }
  return unreadCount;
}
