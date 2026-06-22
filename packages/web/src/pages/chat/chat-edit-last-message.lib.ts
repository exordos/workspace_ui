import { canStartMessageContentEdit } from "~/entities/message/message-edit-policy.lib";
import type { MockMessage } from "~/shared/api/messenger.types";
import type { UserId } from "~/shared/lib/user-id.lib";
import type { CurrentUserMessageEditPolicy } from "~/shared/types/message-edit-policy";

export function resolveLastOwnMessageForEdit(
  messages: readonly MockMessage[],
  currentUserId: UserId | null,
  policy: CurrentUserMessageEditPolicy | undefined = undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
): MockMessage | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message && canStartMessageContentEdit(message, currentUserId, policy, nowSeconds)) {
      return message;
    }
  }
  return null;
}
