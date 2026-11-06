import type { RealChatSession } from "~/entities/messenger/chat-crypto-runtime.lib";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import { t } from "~/i18n/i18n";

interface ServiceAction {
  readonly label: string;
  readonly disabled?: boolean;
  readonly onClick: () => void;
}

export interface EncryptedChatServiceState {
  readonly deviceId: string;
  readonly canManageKeys: boolean;
  readonly hasKey: boolean;
  readonly requestStatus: "pending" | "granted" | "rejected" | null;
}

/** Response actions and labels share the same scoped request correlation. */
export function resolveEncryptedChatKeyResponse({
  message,
  request,
  currentUserUuid,
  state,
}: {
  readonly message: MessengerMessage;
  readonly request: MessengerMessage | null;
  readonly currentUserUuid: string;
  readonly state: EncryptedChatServiceState | null | undefined;
}): {
  readonly recipient: { readonly userUuid: string; readonly deviceName: string } | undefined;
  readonly ownResponse: boolean;
} {
  const response = message.payload;
  const recipient =
    (response.kind === "key_grant" || response.kind === "key_reject") &&
    request?.projectId === message.projectId &&
    request.uuid === response.requestMessageUuid &&
    request.streamUuid === message.streamUuid &&
    request.payload.kind === "key_request" &&
    request.payload.keyUuid === response.keyUuid &&
    request.payload.deviceId === response.recipientDeviceId
      ? { userUuid: request.authorUuid, deviceName: request.payload.deviceName }
      : undefined;
  return {
    recipient,
    ownResponse:
      recipient?.userUuid === currentUserUuid &&
      (response.kind === "key_grant" || response.kind === "key_reject") &&
      state?.deviceId === response.recipientDeviceId,
  };
}

/** Read only public presentation state from the existing scoped session. */
export function getEncryptedChatServiceState({
  message,
  streamUuid,
  projectId,
  session,
}: {
  readonly message: MessengerMessage;
  readonly streamUuid: string | null;
  readonly projectId?: string;
  readonly session: Pick<
    RealChatSession,
    | "device"
    | "getRights"
    | "getGenerationState"
    | "getKeyRequestOutcome"
    | "canRespondToKeyRequest"
  > | null;
}): EncryptedChatServiceState | null {
  const payload = message.payload;
  if (
    session == null ||
    message.streamUuid !== streamUuid ||
    message.projectId !== projectId ||
    payload.kind === "markdown" ||
    payload.kind === "e2ee"
  )
    return null;
  const rights = session.getRights();
  let requestUuid: string | null = null;
  if (payload.kind === "key_request") requestUuid = message.uuid;
  if (payload.kind === "key_grant" || payload.kind === "key_reject")
    requestUuid = payload.requestMessageUuid;
  const outcome = requestUuid == null ? undefined : session.getKeyRequestOutcome(requestUuid);
  return {
    deviceId: session.device.deviceId,
    canManageKeys:
      requestUuid == null
        ? rights.canGrant || rights.canReject
        : session.canRespondToKeyRequest(requestUuid),
    hasKey: session.getGenerationState(payload.keyUuid)?.access === "ready",
    requestStatus: outcome?.status ?? null,
  };
}
interface ServiceActionOptions {
  readonly message: MessengerMessage;
  readonly currentUserUuid?: string;
  readonly streamUuid: string | null;
  readonly projectId?: string;
  readonly session: Pick<
    RealChatSession,
    | "getRights"
    | "getGenerationState"
    | "isIssuerAllowed"
    | "canGrantKey"
    | "canRejectKey"
    | "device"
  > | null;
  readonly pending: boolean;
  readonly onRequestKey: (keyUuid: string) => void;
  readonly onGrantKey: (requestUuid: string) => void;
  readonly onRejectKey: (requestUuid: string) => void;
}

/** Actions follow the message generation and scoped issuer policy, never the latest key implicitly. */
export function getEncryptedChatServiceActions({
  message,
  currentUserUuid,
  streamUuid,
  projectId,
  session,
  pending,
  onRequestKey,
  onGrantKey,
  onRejectKey,
}: ServiceActionOptions): readonly ServiceAction[] {
  const payload = message.payload;
  if (
    session == null ||
    message.streamUuid !== streamUuid ||
    message.projectId !== projectId ||
    payload.kind === "markdown" ||
    payload.kind === "e2ee"
  )
    return [];
  if (payload.kind === "key_announced" || payload.kind === "key_reject") {
    const generation = session.getGenerationState(payload.keyUuid);
    if (
      !session.getRights().canRequest ||
      generation?.access === "ready" ||
      !session.isIssuerAllowed(message.authorUuid)
    )
      return [];
    return [
      {
        label: t("e2ee.requestAccess"),
        disabled: pending || generation?.requestStatus === "requested",
        onClick: () => onRequestKey(payload.keyUuid),
      },
    ];
  }
  if (
    payload.kind !== "key_request" ||
    (message.authorUuid === currentUserUuid && payload.deviceId === session.device.deviceId)
  )
    return [];
  const actions: ServiceAction[] = [];
  if (session.canGrantKey(message.uuid))
    actions.push({
      label: t("e2ee.serviceTransferKey"),
      disabled: pending,
      onClick: () => onGrantKey(message.uuid),
    });
  if (session.canRejectKey(message.uuid))
    actions.push({
      label: t("e2ee.rejectAccess"),
      disabled: pending,
      onClick: () => onRejectKey(message.uuid),
    });
  return actions;
}
