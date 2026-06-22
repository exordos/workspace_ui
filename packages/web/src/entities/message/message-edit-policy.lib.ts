import type { MockMessage } from "~/shared/api/messenger.types";
import { isMessageFromCurrentUser } from "~/shared/lib/message-author.lib";
import type { UserId } from "~/shared/lib/user-id.lib";
import type { CurrentUserMessageEditPolicy } from "~/shared/types/message-edit-policy";

export function canStartMessageContentEdit(
  message: MockMessage,
  currentUserId: UserId | null | undefined,
  policy: CurrentUserMessageEditPolicy | undefined,
  nowSeconds: number,
): boolean {
  if (!isMessageFromCurrentUser(message, currentUserId)) return false;
  if (policy?.allowMessageEditing === false) return false;

  const limitSeconds = policy?.messageContentEditLimitSeconds;
  if (limitSeconds == null) return true;

  return message.timestamp + limitSeconds > nowSeconds;
}
