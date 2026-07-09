import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import type { CurrentUserMessageEditPolicy } from "~/shared/types/message-edit-policy";

interface ZulipRegisterMessageEditPolicyInput {
  realm_allow_message_editing?: boolean;
  realm_message_content_edit_limit_seconds?: number | null;
}

export function messageEditPolicyFromZulipRegister(
  registration: ZulipRegisterMessageEditPolicyInput,
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
  registration: ZulipRegisterMessageEditPolicyInput,
): void {
  useChatListStore
    .getState()
    .setCurrentUserMessageEditPolicy(messageEditPolicyFromZulipRegister(registration));
}
