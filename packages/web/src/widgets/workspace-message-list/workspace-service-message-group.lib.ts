import type { MessengerMessage, MessengerUuid } from "~/entities/messenger/messenger.types";
import { resolveEncryptedChatKeyResponse } from "~/features/encrypted-chat-message/encrypted-chat-service-actions.lib";
import type {
  WorkspaceMessageListActions,
  WorkspaceMessageListItem,
} from "./workspace-message-list.types";

export type WorkspaceServiceGroupStatus = "action-required" | "waiting" | "unavailable" | null;

export function isWorkspaceMessageRelevantToAccount(
  message: MessengerMessage,
  currentUserUuid: MessengerUuid,
  actions: WorkspaceMessageListActions | undefined,
): boolean {
  const payload = message.payload;
  if (payload.kind === "markdown" || payload.kind === "e2ee") return true;
  if (payload.kind === "key_announced") return false;
  if (message.authorUuid === currentUserUuid) return true;
  if (payload.kind === "key_request") {
    return (
      actions?.getKeyServiceState?.(message)?.canManageKeys === true ||
      (actions?.getKeyRequestActions?.(message)?.length ?? 0) > 0
    );
  }
  const request = actions?.resolveKeyRequestMessage?.(payload.requestMessageUuid) ?? null;
  const { recipient } = resolveEncryptedChatKeyResponse({
    message,
    request,
    currentUserUuid,
    state: undefined,
  });
  // Account relevance includes other devices; action availability stays device-scoped.
  return (
    recipient != null &&
    (recipient.userUuid === currentUserUuid ||
      (request != null && isWorkspaceMessageRelevantToAccount(request, currentUserUuid, actions)))
  );
}

function getServiceMessageStatus(
  message: MessengerMessage,
  currentUserUuid: MessengerUuid,
  actions: WorkspaceMessageListActions | undefined,
): WorkspaceServiceGroupStatus {
  const payload = message.payload;
  if (payload.kind === "markdown" || payload.kind === "e2ee" || payload.kind === "key_grant")
    return null;
  const state = actions?.getKeyServiceState?.(message);
  if (
    payload.kind === "key_request" &&
    (state?.requestStatus === "granted" || state?.requestStatus === "rejected")
  )
    return null;
  // Retry belongs only to the device addressed by the rejection.
  if (payload.kind === "key_reject") {
    if (state == null) return "unavailable";
    if (state.deviceId !== payload.recipientDeviceId) return null;
    const { recipient, ownResponse } = resolveEncryptedChatKeyResponse({
      message,
      request: actions?.resolveKeyRequestMessage?.(payload.requestMessageUuid) ?? null,
      currentUserUuid,
      state,
    });
    if (recipient == null) return "unavailable";
    if (!ownResponse) return null;
  }
  const serviceActions = actions?.getKeyRequestActions?.(message) ?? [];
  if (serviceActions.some((action) => !action.disabled)) return "action-required";
  if (serviceActions.length > 0) return "waiting";
  if (payload.kind === "key_request") {
    return state?.requestStatus === "pending" ||
      (state != null && message.authorUuid === currentUserUuid)
      ? "waiting"
      : "unavailable";
  }
  return state == null ? "unavailable" : null;
}

export function getWorkspaceServiceGroupStatus(
  messages: readonly WorkspaceMessageListItem[],
  currentUserUuid: MessengerUuid,
  actions: WorkspaceMessageListActions | undefined,
): WorkspaceServiceGroupStatus {
  let waiting = false;
  let unavailable = false;
  for (const item of messages) {
    if (item.kind !== "server") continue;
    const status = getServiceMessageStatus(item.message, currentUserUuid, actions);
    if (status === "action-required") return status;
    waiting ||= status === "waiting";
    unavailable ||= status === "unavailable";
  }
  if (waiting) return "waiting";
  return unavailable ? "unavailable" : null;
}
