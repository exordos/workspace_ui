import { useMemo } from "react";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import { EncryptedMessagePlaceholder } from "~/features/encrypted-chat-message/encrypted-message-placeholder.ui";
import type { MessagePresentation } from "~/features/message-presentation/message-presentation.hook";
import { t } from "~/i18n/i18n";
import { WorkspaceMessageBubblePresentation } from "./workspace-message-bubble-presentation.ui";
import type { WorkspaceMessageBubbleProps } from "./workspace-message-bubble.types";

/** Outgoing and prepared server text share one shell, including their mounted quotes. */
export function WorkspaceMessageContentBubble({
  content,
  ...props
}: Readonly<WorkspaceMessageBubbleProps & { content?: MessagePresentation }>) {
  const source = props.message.kind === "server" ? props.message.message : null;
  const encrypted = source?.payload.kind === "e2ee";
  const encryptedChat = useMessengerStore((state) =>
    source == null ? false : state.streamsById[source.streamUuid]?.encryption === true,
  );
  const actions = useMemo(
    () =>
      encrypted && !encryptedChat && props.actions != null
        ? { ...props.actions, onReplyMessage: undefined, onEditMessage: undefined }
        : props.actions,
    [encrypted, encryptedChat, props.actions],
  );
  if (content?.status === "preparing") return null;
  const markdown =
    content?.status === "ready" && content.kind === "markdown" ? content.markdown : undefined;
  const locked = encrypted && markdown == null;
  const error = content?.status === "error";
  return (
    <WorkspaceMessageBubblePresentation
      {...props}
      actions={actions}
      authorOutside={encrypted && source.authorUuid !== props.currentUserUuid}
      bodyMarkdown={markdown}
      locked={locked}
      requestMessageKeyAvailable={content?.canRequestKey === true}
      bodyOverride={
        locked ? (
          <EncryptedMessagePlaceholder
            state={error ? "error" : "locked"}
            title={t(error ? "e2ee.messageDecryptError" : "e2ee.lockedTitle")}
            action={
              error
                ? {
                    label: t("e2ee.messageDecryptRetry"),
                    onClick: content.retry,
                    disabled: content.retryPending,
                  }
                : undefined
            }
          />
        ) : undefined
      }
    />
  );
}
