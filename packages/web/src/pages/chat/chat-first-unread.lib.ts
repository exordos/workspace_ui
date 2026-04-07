import type { MockMessage } from "~/shared/api/zulip.types";

export function resolveFirstUnreadBoundaryMessageId(
  messages: readonly MockMessage[],
  currentUserId: number | null | undefined,
): number | undefined {
  for (const message of messages) {
    if (message.flags?.includes("read")) {
      continue;
    }
    if (currentUserId != null && message.sender_id === currentUserId) {
      continue;
    }
    return message.id;
  }
  return undefined;
}

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
