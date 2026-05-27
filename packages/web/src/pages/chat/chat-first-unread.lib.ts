import type { MockMessage } from "~/shared/api/zulip.types";
import {
  resolveFirstUnreadBoundaryMessageId,
  resolveLastUnreadBoundaryMessageId,
} from "~/shared/lib/message-unread-boundary.lib";

export { resolveFirstUnreadBoundaryMessageId, resolveLastUnreadBoundaryMessageId };

export function countUnreadMessages(
  messages: readonly MockMessage[],
  currentUserId?: number | null,
): number {
  let unreadCount = 0;
  for (const message of messages) {
    if (message.flags?.includes("read")) {
      continue;
    }
    if (currentUserId != null && message.sender_id === currentUserId) {
      continue;
    }
    unreadCount += 1;
  }
  return unreadCount;
}
