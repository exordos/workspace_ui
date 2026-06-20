import { useUsersStore } from "~/entities/user/user.model";
import type { ZulipEvent } from "~/shared/api/zulip.types";
import {
  parseMessageContentEditLimitSeconds,
  parseMessageEditPolicyBoolean,
} from "~/shared/lib/message-edit-policy-parse.lib";

export function handleRealm(event: ZulipEvent): void {
  const data = resolveRealmUpdateData(event);
  if (data == null) {
    return;
  }
  const next = { ...useUsersStore.getState().currentUserMessageEditPolicy };
  let changed = false;

  if (Object.prototype.hasOwnProperty.call(data, "allow_message_editing")) {
    const allowMessageEditing = parseMessageEditPolicyBoolean(data.allow_message_editing);
    if (allowMessageEditing !== undefined) {
      next.allowMessageEditing = allowMessageEditing;
      changed = true;
    }
  }

  if (Object.prototype.hasOwnProperty.call(data, "message_content_edit_limit_seconds")) {
    const messageContentEditLimitSeconds = parseMessageContentEditLimitSeconds(
      data.message_content_edit_limit_seconds,
    );
    if (messageContentEditLimitSeconds !== undefined) {
      next.messageContentEditLimitSeconds = messageContentEditLimitSeconds;
      changed = true;
    }
  }

  if (changed) {
    useUsersStore.getState().setCurrentUserMessageEditPolicy(next);
  }
}

function resolveRealmUpdateData(event: ZulipEvent): Record<string, unknown> | null {
  if (event.op === "update_dict" && event.data != null && typeof event.data === "object") {
    return event.data as Record<string, unknown>;
  }

  if (event.op === "update" && typeof event.property === "string") {
    return { [event.property]: event.value };
  }

  return null;
}
