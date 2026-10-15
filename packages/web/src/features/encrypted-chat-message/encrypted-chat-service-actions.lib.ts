import type { RealChatSession } from "~/entities/messenger/chat-crypto-runtime.lib";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import { t } from "~/i18n/i18n";

interface ServiceAction {
  readonly label: string;
  readonly disabled?: boolean;
  readonly onClick: () => void;
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
      label: t("e2ee.confirmAccess"),
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
