import { useMemo } from "react";
import { WorkspaceMessageBody } from "~/entities/messenger/messenger-workspace-message-body.ui";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import { useDevMessagePresentation } from "~/features/encrypted-chat-message/dev-message-presentation.hook";
import { EncryptedChatServiceMessage } from "~/features/encrypted-chat-message/encrypted-chat-service-message.ui";
import { EncryptedMessagePlaceholder } from "~/features/encrypted-chat-message/encrypted-message-placeholder.ui";
import { t } from "~/i18n/i18n";
import { formatMessageTimeShort } from "~/shared/lib/datetime.lib";
import { parseWorkspaceMessageBody } from "~/shared/lib/workspace-message-render/workspace-message-parse.lib";
import { renderWorkspaceMessageBody } from "~/shared/lib/workspace-message-render/workspace-message-render.lib";
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

function EncryptedMessageBody({
  rendered,
}: {
  readonly rendered: ReturnType<typeof renderWorkspaceMessageBody> | null;
}) {
  if (rendered == null)
    return (
      <EncryptedMessagePlaceholder
        state="locked"
        title={t("e2ee.lockedTitle")}
        description={t("e2ee.cryptoUnavailable")}
      />
    );
  return (
    <div className="max-w-md rounded-[18px] bg-bg-elevated px-3 py-2 text-sm text-text-primary shadow-sm">
      <WorkspaceMessageBody
        html={rendered.html}
        metadata={rendered.metadata}
        useInlineMeta={false}
      />
    </div>
  );
}

/** Only scoped local mock plaintext enters the safe renderer; stored envelopes stay opaque. */
export function WorkspaceEncryptedMessageBubble({
  message,
  currentUserUuid,
  isFirstInGroup,
  isLastInGroup,
  isSelected,
  readRequestPending,
  resolveAuthorLabel,
}: WorkspaceEncryptedMessageBubbleProps) {
  const plaintext = useDevMessagePresentation(message);
  const rendered = useMemo(
    () =>
      plaintext == null ? null : renderWorkspaceMessageBody(parseWorkspaceMessageBody(plaintext)),
    [plaintext],
  );
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
        <EncryptedMessageBody rendered={rendered} />
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
