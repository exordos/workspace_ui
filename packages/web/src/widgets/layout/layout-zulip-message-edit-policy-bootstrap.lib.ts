import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import type { RegisterQueueResult } from "~/shared/api/zulip.types";
import type { CurrentUserMessageEditPolicy } from "~/shared/types/message-edit-policy";

export function messageEditPolicyFromZulipRegister(
  registration: Pick<
    RegisterQueueResult,
    "realm_allow_message_editing" | "realm_message_content_edit_limit_seconds"
  >,
): CurrentUserMessageEditPolicy | undefined {
  const hasAllowMessageEditing = registration.realm_allow_message_editing !== undefined;
  const hasContentEditLimit = registration.realm_message_content_edit_limit_seconds !== undefined;

  if (!hasAllowMessageEditing && !hasContentEditLimit) {
    return undefined;
  }

  return {
    ...(hasAllowMessageEditing
      ? { allowMessageEditing: registration.realm_allow_message_editing }
      : {}),
    ...(hasContentEditLimit
      ? {
          messageContentEditLimitSeconds: registration.realm_message_content_edit_limit_seconds,
        }
      : {}),
  };
}

export function applyZulipRegisterMessageEditPolicy(
  registration: Pick<
    RegisterQueueResult,
    "realm_allow_message_editing" | "realm_message_content_edit_limit_seconds"
  >,
): void {
  useChatListStore
    .getState()
    .setCurrentUserMessageEditPolicy(messageEditPolicyFromZulipRegister(registration));
}
