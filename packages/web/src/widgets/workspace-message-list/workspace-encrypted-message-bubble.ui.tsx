import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import { EncryptedChatServiceMessage } from "~/features/encrypted-chat-message/encrypted-chat-service-message.ui";
import { EncryptedMessagePlaceholder } from "~/features/encrypted-chat-message/encrypted-message-placeholder.ui";
import { t } from "~/i18n/i18n";
import { formatMessageTimeShort } from "~/shared/lib/datetime.lib";
import { WorkspaceMessageBubbleMeta } from "./workspace-message-bubble-meta.ui";

interface WorkspaceEncryptedMessageBubbleProps {
  readonly message: MessengerMessage;
  readonly currentUserUuid: string;
  readonly isFirstInGroup: boolean;
  readonly isLastInGroup: boolean;
  readonly isSelected?: boolean;
  readonly readRequestPending?: boolean;
  readonly resolveAuthorLabel?: (authorUuid: string) => string | null | undefined;
}

/** Encoded key material never enters the Markdown renderer, menu, or file loaders. */
export function WorkspaceEncryptedMessageBubble({
  message,
  currentUserUuid,
  isFirstInGroup,
  isLastInGroup,
  isSelected,
  readRequestPending,
  resolveAuthorLabel,
}: WorkspaceEncryptedMessageBubbleProps) {
  const payload = message.payload;
  if (payload.kind === "markdown") return null;
  const date = new Date(message.createdAt);
  const time = Number.isNaN(date.getTime())
    ? message.createdAt.slice(11, 16)
    : formatMessageTimeShort(date.getTime() / 1000);
  const author = resolveAuthorLabel?.(message.authorUuid) ?? `#${message.authorUuid.slice(0, 8)}`;
  const titles = {
    key_request: t("e2ee.keyRequestTitle"),
    key_grant: t("e2ee.keyGrantTitle"),
    key_announced: t("e2ee.keyAnnouncedTitle"),
    key_reject: t("e2ee.keyRejectTitle"),
  };
  return (
    <div
      className={`flex max-w-full flex-col gap-1 ${isSelected ? "rounded-lg ring-2 ring-accent" : ""} ${readRequestPending ? "workspace-message-read-request-pulse" : ""}`}
      data-message-owner={message.authorUuid === currentUserUuid ? "own" : "peer"}
      data-first-in-group={isFirstInGroup ? "true" : "false"}
      data-last-in-group={isLastInGroup ? "true" : "false"}
      data-read-request-pending={readRequestPending ? "true" : undefined}
      aria-busy={readRequestPending ? true : undefined}
      data-workspace-message-bubble="true"
      data-payload-kind={payload.kind}
    >
      {message.authorUuid !== currentUserUuid && isFirstInGroup ? (
        <p className="text-xs font-medium text-text-muted" data-peer-author-label="true">
          {author}
        </p>
      ) : null}
      {payload.kind === "e2ee" ? (
        <EncryptedMessagePlaceholder
          state="locked"
          title={t("e2ee.lockedTitle")}
          description={t("e2ee.cryptoUnavailable")}
        />
      ) : (
        <EncryptedChatServiceMessage
          kind={payload.kind}
          title={titles[payload.kind]}
          deviceName={payload.kind === "key_request" ? payload.deviceName : undefined}
          description={
            payload.kind === "key_grant" ? t("e2ee.grantReceivedDescription") : undefined
          }
        />
      )}
      <WorkspaceMessageBubbleMeta createdAt={message.createdAt} time={time} />
    </div>
  );
}
