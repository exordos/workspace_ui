import { useResolvedMessengerQuoteMessage } from "~/entities/messenger/messenger-quote-resolver.hook";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import {
  type EncryptedChatServiceState,
  resolveEncryptedChatKeyResponse,
} from "~/features/encrypted-chat-message/encrypted-chat-service-actions.lib";
import { EncryptedChatServiceMessage } from "~/features/encrypted-chat-message/encrypted-chat-service-message.ui";
import { t } from "~/i18n/i18n";
import type { WorkspaceMessageBubbleProps } from "./workspace-message-bubble.types";

interface WorkspaceEncryptedMessageBubbleProps extends Omit<
  WorkspaceMessageBubbleProps,
  "message" | "usersById"
> {
  readonly message: MessengerMessage;
  readonly usersById?: WorkspaceMessageBubbleProps["usersById"];
}
type KeyResponsePayload = Extract<
  MessengerMessage["payload"],
  { kind: "key_grant" | "key_reject" }
>;

function KeyResponseServiceMessage({
  response,
  ...props
}: Readonly<WorkspaceEncryptedMessageBubbleProps & { response: KeyResponsePayload }>) {
  const { message, currentUserUuid, resolveAuthorLabel, actions } = props;
  const suppliedRequest = actions?.resolveKeyRequestMessage?.(response.requestMessageUuid);
  const { message: resolvedRequest } = useResolvedMessengerQuoteMessage(
    response.requestMessageUuid,
    suppliedRequest == null,
  );
  const request = suppliedRequest ?? resolvedRequest;
  const state = actions?.getKeyServiceState?.(message);
  const { recipient, ownResponse } = resolveEncryptedChatKeyResponse({
    message,
    request,
    currentUserUuid,
    state,
  });
  const granted = response.kind === "key_grant";
  const ownRecipient = recipient?.userUuid === currentUserUuid;
  const userLabel = (uuid: string) => resolveAuthorLabel?.(uuid) ?? `#${uuid.slice(0, 8)}`;
  const author = userLabel(message.authorUuid);
  let title = t(granted ? "e2ee.serviceGrant" : "e2ee.serviceRejected", { name: author });
  let description = t("e2ee.serviceRecipientUnavailable");
  if (recipient != null) {
    description = "";
    const ownSender = message.authorUuid === currentUserUuid;
    const titleKeys = granted
      ? {
          self: "e2ee.serviceGrantSelfDevice",
          ownSender: "e2ee.serviceGrantOwnToDevice",
          ownRecipient: "e2ee.serviceGrantToOwnDevice",
          other: "e2ee.serviceGrantToDevice",
        }
      : {
          self: "e2ee.serviceRejectSelfDevice",
          ownSender: "e2ee.serviceRejectOwnToDevice",
          ownRecipient: "e2ee.serviceRejectToOwnDevice",
          other: "e2ee.serviceRejectToDevice",
        };
    let titleKey = titleKeys.other;
    if (ownRecipient) titleKey = titleKeys.ownRecipient;
    if (ownSender) titleKey = titleKeys.ownSender;
    if (ownSender && ownRecipient) titleKey = titleKeys.self;
    title = t(titleKey, {
      name: author,
      recipient: userLabel(recipient.userUuid),
      device: recipient.deviceName.trim() || t("e2ee.serviceUnknownDevice"),
    });
  }
  // A rejection belongs to its requesting device. Other viewers can request from announcements.
  const ownRejection = !granted && ownResponse;
  const serviceActions = ownRejection ? (actions?.getKeyRequestActions?.(message) ?? []) : [];
  return (
    <EncryptedChatServiceMessage
      kind={response.kind}
      title={title}
      description={description}
      secondaryDescription={serviceActions.length > 0 ? t("e2ee.serviceRetry") : undefined}
      inlineDescription
      statusText={
        ownResponse && granted && state?.hasKey ? t("e2ee.serviceKeyAvailableHere") : undefined
      }
      actionPlacement="secondary"
      actions={serviceActions.map((action) => ({
        ...action,
        label: t("e2ee.serviceRequestAction"),
      }))}
    />
  );
}

function keyRequestDescription(
  ownRequest: boolean,
  requestingDeviceId: string,
  state: EncryptedChatServiceState | null | undefined,
): string | undefined {
  if (state?.requestStatus === "granted" || state?.requestStatus === "rejected") return undefined;
  if (ownRequest && state?.deviceId === requestingDeviceId)
    return t(state.canManageKeys ? "e2ee.serviceApproveElsewhere" : "e2ee.serviceWait");
  if (state?.canManageKeys) return state.hasKey ? undefined : t("e2ee.serviceMissingKeyHere");
  return ownRequest ? t("e2ee.serviceWait") : undefined;
}

function KeyRequestServiceMessage({
  request,
  ...props
}: Readonly<
  WorkspaceEncryptedMessageBubbleProps & {
    request: Extract<MessengerMessage["payload"], { kind: "key_request" }>;
  }
>) {
  const { message, currentUserUuid, resolveAuthorLabel, actions } = props;
  const ownRequest = message.authorUuid === currentUserUuid;
  const state = actions?.getKeyServiceState?.(message);
  const author = resolveAuthorLabel?.(message.authorUuid) ?? `#${message.authorUuid.slice(0, 8)}`;
  let statusText: string | undefined;
  if (state?.requestStatus === "granted") statusText = t("e2ee.serviceRequestGranted");
  if (state?.requestStatus === "rejected") statusText = t("e2ee.serviceRejectedOwn");
  return (
    <EncryptedChatServiceMessage
      kind="key_request"
      title={t(ownRequest ? "e2ee.serviceRequestOwnDevice" : "e2ee.serviceRequestDevice", {
        device: request.deviceName.trim() || t("e2ee.serviceUnknownDevice"),
      })}
      actorName={ownRequest ? undefined : author}
      description={keyRequestDescription(ownRequest, request.deviceId, state)}
      statusText={statusText}
      actions={actions?.getKeyRequestActions?.(message)}
    />
  );
}

/** Key events use the centered service row. Message content belongs to the generic bubble. */
export function WorkspaceEncryptedMessageBubble(
  props: Readonly<WorkspaceEncryptedMessageBubbleProps>,
) {
  const { message, actions } = props;
  const payload = message.payload;
  if (payload.kind === "markdown" || payload.kind === "e2ee") return null;
  if (payload.kind === "key_grant" || payload.kind === "key_reject")
    return <KeyResponseServiceMessage {...props} response={payload} />;
  if (payload.kind === "key_request")
    return <KeyRequestServiceMessage {...props} request={payload} />;
  const serviceActions = actions?.getKeyRequestActions?.(message) ?? [];
  return (
    <EncryptedChatServiceMessage
      kind="key_announced"
      title={t("e2ee.serviceAnnounced")}
      actionPlacement="description"
      description={serviceActions.length > 0 ? t("e2ee.serviceRequestNew") : undefined}
      actions={serviceActions}
    />
  );
}
