import { useResolvedMessengerQuoteMessage } from "~/entities/messenger/messenger-quote-resolver.hook";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import { EncryptedChatServiceMessage } from "~/features/encrypted-chat-message/encrypted-chat-service-message.ui";
import { EncryptedMessagePlaceholder } from "~/features/encrypted-chat-message/encrypted-message-placeholder.ui";
import { useRealMessagePresentation } from "~/features/encrypted-chat-message/real-message-presentation.hook";
import { t } from "~/i18n/i18n";
import { WorkspaceMessageBubblePresentation } from "./workspace-message-bubble-presentation.ui";
import { createWorkspaceMessageListServerItem } from "./workspace-message-list-grouping.lib";
import type { WorkspaceMessageBubbleProps } from "./workspace-message-bubble.types";

interface WorkspaceEncryptedMessageBubbleProps extends Omit<
  WorkspaceMessageBubbleProps,
  "message" | "usersById"
> {
  readonly message: MessengerMessage;
  readonly usersById?: WorkspaceMessageBubbleProps["usersById"];
}
const EMPTY_USERS = {};
const PLACEHOLDER_STATES = {
  ready: "locked",
  "missing-key": "locked",
  loading: "loading",
  error: "error",
} as const;
const PLACEHOLDER_TITLES = {
  ready: "e2ee.lockedTitle",
  "missing-key": "e2ee.lockedTitle",
  loading: "e2ee.messageDecrypting",
  error: "e2ee.messageDecryptError",
} as const;
function EncryptedTextBubble({
  message,
  usersById = EMPTY_USERS,
  ...props
}: Readonly<WorkspaceEncryptedMessageBubbleProps>) {
  const presentation = useRealMessagePresentation(message);
  const plaintext = presentation.status === "ready" ? presentation.plaintext : null;
  return (
    <WorkspaceMessageBubblePresentation
      {...props}
      topicLabel={undefined}
      authorOutside={message.authorUuid !== props.currentUserUuid}
      usersById={usersById}
      message={createWorkspaceMessageListServerItem(message)}
      bodyMarkdown={plaintext ?? ""}
      locked={plaintext == null}
      bodyOverride={
        plaintext == null ? (
          <EncryptedMessagePlaceholder
            state={PLACEHOLDER_STATES[presentation.status]}
            title={t(PLACEHOLDER_TITLES[presentation.status])}
            action={
              presentation.status === "error"
                ? { label: t("e2ee.messageDecryptRetry"), onClick: presentation.retry }
                : undefined
            }
            secondaryAction={
              presentation.status === "error" &&
              presentation.canRequestKey === true &&
              props.actions?.onRequestMessageKey
                ? {
                    label: t("e2ee.requestMessageKey"),
                    onClick: () => {
                      void props.actions?.onRequestMessageKey?.(message.uuid);
                    },
                    disabled: props.actions.requestMessageKeyPending,
                  }
                : undefined
            }
          />
        ) : undefined
      }
    />
  );
}

type KeyResponsePayload = Extract<
  MessengerMessage["payload"],
  { kind: "key_grant" | "key_reject" }
>;

function resolveKeyResponseRecipient(
  request: MessengerMessage | null,
  message: MessengerMessage,
  response: KeyResponsePayload,
): string | undefined {
  return request?.projectId === message.projectId &&
    request.streamUuid === message.streamUuid &&
    request.payload.kind === "key_request" &&
    request.payload.keyUuid === response.keyUuid &&
    request.payload.deviceId === response.recipientDeviceId
    ? request.authorUuid
    : undefined;
}

function KeyResponseServiceMessage({
  response,
  ...props
}: Readonly<WorkspaceEncryptedMessageBubbleProps & { response: KeyResponsePayload }>) {
  const { message, currentUserUuid, resolveAuthorLabel, actions } = props;
  const { message: request } = useResolvedMessengerQuoteMessage(response.requestMessageUuid);
  const recipientUuid = resolveKeyResponseRecipient(request, message, response);
  const granted = response.kind === "key_grant";
  const ownResponse = recipientUuid != null && recipientUuid === currentUserUuid;
  const userLabel = (uuid: string) => resolveAuthorLabel?.(uuid) ?? `#${uuid.slice(0, 8)}`;
  const author = userLabel(message.authorUuid);
  let title = t(granted ? "e2ee.serviceGrant" : "e2ee.serviceRejected", { name: author });
  let description = t("e2ee.serviceRecipientUnavailable");
  if (ownResponse) {
    title = t(granted ? "e2ee.serviceGrantOwn" : "e2ee.serviceRejectedOwn");
    description = t(
      granted ? "e2ee.serviceGrantOwnDescription" : "e2ee.serviceRejectedOwnDescription",
    );
  } else if (recipientUuid != null) {
    description = "";
    title = t(granted ? "e2ee.serviceGrantTo" : "e2ee.serviceRejectedFor", {
      name: author,
      recipient: userLabel(recipientUuid),
    });
  }
  const serviceActions = actions?.getKeyRequestActions?.(message) ?? [];
  const ownRejection = !granted && ownResponse;
  const showRetryLine = ownRejection && serviceActions.length > 0;
  let actionPlacement: "title" | "description" | "secondary" = granted ? "title" : "description";
  if (ownRejection) actionPlacement = "secondary";
  if (!granted && !ownRejection && serviceActions.length > 0)
    description = [description, t("e2ee.serviceRetry")].filter(Boolean).join(" ");
  return (
    <EncryptedChatServiceMessage
      kind={response.kind}
      title={title}
      description={description}
      secondaryDescription={showRetryLine ? t("e2ee.serviceRetry") : undefined}
      inlineDescription
      actionPlacement={actionPlacement}
      actions={
        ownRejection
          ? serviceActions.map((action) => ({ ...action, label: t("e2ee.serviceRequestAction") }))
          : serviceActions
      }
    />
  );
}

/** Events use the centered service row; text reuses the ordinary message shell. */
export function WorkspaceEncryptedMessageBubble(
  props: Readonly<WorkspaceEncryptedMessageBubbleProps>,
) {
  const { message, currentUserUuid, resolveAuthorLabel, actions } = props;
  const payload = message.payload;
  if (payload.kind === "markdown") return null;
  if (payload.kind === "e2ee") return <EncryptedTextBubble {...props} />;
  if (payload.kind === "key_grant" || payload.kind === "key_reject")
    return <KeyResponseServiceMessage {...props} response={payload} />;
  const author = resolveAuthorLabel?.(message.authorUuid) ?? `#${message.authorUuid.slice(0, 8)}`;
  const ownRequest = payload.kind === "key_request" && message.authorUuid === currentUserUuid;
  const titles = {
    key_request: ownRequest ? t("e2ee.serviceRequestOwn") : t("e2ee.serviceRequestSentence"),
    key_announced: t("e2ee.serviceAnnounced"),
  };
  const serviceActions = actions?.getKeyRequestActions?.(message) ?? [];
  return (
    <EncryptedChatServiceMessage
      kind={payload.kind}
      title={titles[payload.kind]}
      actorName={payload.kind === "key_request" && !ownRequest ? author : undefined}
      actionPlacement={payload.kind === "key_announced" ? "description" : "title"}
      description={
        ownRequest && serviceActions.length === 0
          ? t("e2ee.serviceWait")
          : serviceActions.length > 0 && payload.kind === "key_announced"
            ? t("e2ee.serviceRequestNew")
            : undefined
      }
      actions={serviceActions}
    />
  );
}
