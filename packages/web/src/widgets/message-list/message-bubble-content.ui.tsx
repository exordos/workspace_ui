import React from "react";
import { t } from "~/i18n/i18n";
import type { MockMessage } from "~/shared/api/zulip.types";
import { MESSAGE_BUBBLE_BODY_CLASS_NAME } from "~/shared/lib/message-body-rich-text-classes";
import { Icon } from "~/shared/ui/icon";
import { Spinner } from "~/shared/ui/spinner.ui";
import { MessageBubbleOwnDeliveryIndicator } from "./message-bubble-own-delivery-indicator.ui";
import { MessageBubbleReactionsRow } from "./message-bubble-reactions-row.ui";
import { MessageLinkPreview } from "./message-link-preview.ui";
import type { GroupedReaction } from "./message-bubble-emoji.lib";
import type {
  MessageBubbleCallbacks,
  MessageBubbleOwnDeliveryStatus,
} from "./message-bubble.types";
import type { MessageLinkPreviewViewItem } from "./message-link-preview.hook";

interface MessageBubbleStandardBodyProps {
  message: MockMessage;
  isOwn: boolean;
  time: string;
  hasReactions: boolean;
  reactionGroups: GroupedReaction[];
  currentUserId: number | undefined;
  resolveReactionAuthorLabel: (userId: number) => string;
  callbacks: MessageBubbleCallbacks | undefined;
  ownDeliveryIndicator: React.ReactNode;
  bubbleSurfaceClass: string;
  ownBubbleTailClass: string;
  peerBubbleTailClass: string;
  ownBubbleBackgroundClass: string;
  peerBubbleBackgroundClass: string;
  messageBodyRef: React.RefObject<HTMLDivElement | null>;
  linkPreviewVisibilityRef: React.RefObject<HTMLDivElement | null>;
  linkPreviews: MessageLinkPreviewViewItem[];
}

export const MessageBubbleStandardBody = React.memo<MessageBubbleStandardBodyProps>(
  function MessageBubbleStandardBody({
    message,
    isOwn,
    time,
    hasReactions,
    reactionGroups,
    currentUserId,
    resolveReactionAuthorLabel,
    callbacks,
    ownDeliveryIndicator,
    bubbleSurfaceClass,
    ownBubbleTailClass,
    peerBubbleTailClass,
    ownBubbleBackgroundClass,
    peerBubbleBackgroundClass,
    messageBodyRef,
    linkPreviewVisibilityRef,
    linkPreviews,
  }) {
    return (
      <div
        ref={linkPreviewVisibilityRef}
        className={`relative overflow-hidden px-3 py-2 ${bubbleSurfaceClass} transition-colors duration-700 ${
          isOwn
            ? `${ownBubbleTailClass} ${ownBubbleBackgroundClass} text-text-primary`
            : `${peerBubbleTailClass} ${peerBubbleBackgroundClass} text-text-primary`
        }`}
      >
        <div ref={messageBodyRef} className={MESSAGE_BUBBLE_BODY_CLASS_NAME} />
        {linkPreviews.length > 0 ? (
          <div className="mt-2 flex flex-col gap-2">
            {linkPreviews.map((item) => (
              <MessageLinkPreview
                key={item.previewUrl}
                previewUrl={item.previewUrl}
                previewData={item.previewData}
                status={item.status}
                stacked
              />
            ))}
          </div>
        ) : null}
        <div className={`mt-2 flex min-w-0 items-end gap-2 ${hasReactions ? "" : "justify-end"}`}>
          {hasReactions ? (
            <div className="min-w-0 flex-1">
              <MessageBubbleReactionsRow
                message={message}
                isOwn={isOwn}
                currentUserId={currentUserId}
                reactionGroups={reactionGroups}
                resolveReactionAuthorLabel={resolveReactionAuthorLabel}
                callbacks={callbacks}
              />
            </div>
          ) : null}
          <div className="flex flex-shrink-0 items-center gap-1 text-[11px] text-text-muted">
            <span>{time}</span>
            {ownDeliveryIndicator}
          </div>
        </div>
      </div>
    );
  },
);

export function resolveMessageEditStatusIndicatorNode(
  message: MockMessage,
  callbacks: MessageBubbleCallbacks | undefined,
): React.ReactNode {
  if (message.edit_status === "saving") {
    return (
      <span
        data-testid={`message-edit-status-${message.id}`}
        className="inline-flex size-3.5 items-center justify-center text-text-muted"
        title={t("message.editSaving")}
        aria-label={t("message.editSaving")}
      >
        <span className="sr-only">{t("message.editSaving")}</span>
        <Spinner size="sm" variant="inherit" />
      </span>
    );
  }

  if (message.edit_status !== "failed") {
    return null;
  }

  return (
    <span
      data-testid={`message-edit-status-${message.id}`}
      className="inline-flex items-center gap-0.5"
      title={message.edit_error ?? t("message.editFailed")}
    >
      <button
        type="button"
        className="rounded-sm text-text-muted hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
        title={t("message.retryEdit")}
        aria-label={t("message.retryEdit")}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          callbacks?.onRetryFailedEdit?.(message);
        }}
      >
        <Icon name="send" size={14} className="shrink-0" />
      </button>
      <button
        type="button"
        className="rounded-sm text-text-muted hover:text-notice-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
        title={t("message.cancelEdit")}
        aria-label={t("message.cancelEdit")}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          callbacks?.onCancelFailedEdit?.(message);
        }}
      >
        <Icon name="close" size={14} className="shrink-0" />
      </button>
    </span>
  );
}

export function resolveOwnDeliveryIndicatorNode(
  ownDeliveryStatus: MessageBubbleOwnDeliveryStatus | null,
  message: MockMessage,
  callbacks: MessageBubbleCallbacks | undefined,
): React.ReactNode {
  if (
    ownDeliveryStatus !== "sent" &&
    ownDeliveryStatus !== "sending" &&
    ownDeliveryStatus !== "failed"
  ) {
    return null;
  }

  let status: "sent" | "sending" | "failed" = "failed";
  if (ownDeliveryStatus === "sent") {
    status = "sent";
  } else if (ownDeliveryStatus === "sending") {
    status = "sending";
  }

  return (
    <MessageBubbleOwnDeliveryIndicator
      message={message}
      status={status}
      onViews={callbacks?.onViews}
      onRetryFailedOutgoing={callbacks?.onRetryFailedOutgoing}
      onRemoveFailedOutgoing={callbacks?.onRemoveFailedOutgoing}
    />
  );
}
