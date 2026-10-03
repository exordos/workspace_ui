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
function EncryptedTextBubble({
  message,
  usersById = EMPTY_USERS,
  ...props
}: Readonly<WorkspaceEncryptedMessageBubbleProps>) {
  const plaintext = useRealMessagePresentation(message);
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
          <EncryptedMessagePlaceholder state="locked" title={t("e2ee.lockedTitle")} />
        ) : undefined
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
  const author = resolveAuthorLabel?.(message.authorUuid) ?? `#${message.authorUuid.slice(0, 8)}`;
  const ownRequest = payload.kind === "key_request" && message.authorUuid === currentUserUuid;
  const titles = {
    key_request: ownRequest ? t("e2ee.serviceRequestOwn") : t("e2ee.serviceRequestSentence"),
    key_grant: t("e2ee.serviceGrant", { name: author }),
    key_announced: t("e2ee.serviceAnnounced"),
    key_reject: t("e2ee.serviceRejected", { name: author }),
  };
  const serviceActions = actions?.getKeyRequestActions?.(message) ?? [];
  return (
    <EncryptedChatServiceMessage
      kind={payload.kind}
      title={titles[payload.kind]}
      actorName={payload.kind === "key_request" && !ownRequest ? author : undefined}
      actionPlacement={
        payload.kind === "key_announced" || payload.kind === "key_reject" ? "description" : "title"
      }
      description={
        ownRequest && serviceActions.length === 0
          ? t("e2ee.serviceWait")
          : serviceActions.length > 0 && payload.kind === "key_reject"
            ? t("e2ee.serviceRetry")
            : serviceActions.length > 0 && payload.kind === "key_announced"
              ? t("e2ee.serviceRequestNew")
              : undefined
      }
      actions={serviceActions}
    />
  );
}
