import type { MockMessage } from "~/shared/api/zulip.types";
import type { CurrentUserMessageEditPolicy } from "~/shared/types/message-edit-policy";

export function canStartMessageContentEdit(
  message: MockMessage,
  currentUserId: number | null | undefined,
  policy: CurrentUserMessageEditPolicy | undefined,
  nowSeconds: number,
): boolean {
  if (currentUserId == null) return false;
  if (message.sender_id !== currentUserId) return false;
  if (policy?.allowMessageEditing === false) return false;

  const limitSeconds = policy?.messageContentEditLimitSeconds;
  if (limitSeconds == null) return true;

  return message.timestamp + limitSeconds > nowSeconds;
}
