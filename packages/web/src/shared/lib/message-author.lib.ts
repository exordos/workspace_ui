import { numericUserIdOrNull, userIdsEqual, type UserId } from "./user-id.lib";

export interface MessageAuthorSlice {
  sender_id: number;
  author_uuid?: string;
  sender_uuid?: string;
  is_own?: boolean;
}

export function messageAuthorId(message: MessageAuthorSlice): UserId {
  return message.author_uuid ?? message.sender_uuid ?? message.sender_id;
}

export function isMessageFromCurrentUser(
  message: MessageAuthorSlice,
  currentUserId: UserId | null | undefined,
): boolean {
  if (message.is_own != null) {
    return message.is_own;
  }
  if (currentUserId != null) {
    const authorUuid = message.author_uuid ?? message.sender_uuid;
    if (authorUuid != null && userIdsEqual(authorUuid, currentUserId)) {
      return true;
    }
  }
  const numericCurrentUserId = numericUserIdOrNull(currentUserId);
  return numericCurrentUserId != null && message.sender_id === numericCurrentUserId;
}

export function messageSenderGroupKey(message: MessageAuthorSlice): string {
  if (message.is_own === true) {
    return "own";
  }
  const authorUuid = message.author_uuid ?? message.sender_uuid;
  if (authorUuid != null) {
    return `author:${authorUuid.trim().toLowerCase()}`;
  }
  return `sender:${message.sender_id}`;
}
