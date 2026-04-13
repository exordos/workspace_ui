import React from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import type { MessageBubbleOwnDeliveryIndicatorProps } from "./message-bubble-own-delivery-indicator.types";

export const MessageBubbleOwnDeliveryIndicator = React.memo(
  function MessageBubbleOwnDeliveryIndicator({
    message,
    status,
    onViews,
    onRetryFailedOutgoing,
    onRemoveFailedOutgoing,
  }: MessageBubbleOwnDeliveryIndicatorProps) {
    if (status === "sent") {
      return onViews ? (
        <button
          type="button"
          data-testid={`message-delivery-${message.id}`}
          className="inline-flex items-center text-xs text-call-green focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
          title={t("message.sentToServer")}
          aria-label={t("message.sentToServer")}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onViews(message);
          }}
        >
          <Icon name="check" size={12} className="shrink-0 text-current" />
        </button>
      ) : (
        <span
          data-testid={`message-delivery-${message.id}`}
          className="inline-flex items-center text-xs text-call-green"
          title={t("message.sentToServer")}
          aria-label={t("message.sentToServer")}
        >
          <Icon name="check" size={12} className="shrink-0 text-current" />
        </span>
      );
    }
    if (status === "sending") {
      return (
        <span
          data-testid={`message-delivery-${message.id}`}
          className="inline-flex size-3.5 items-center justify-center text-text-muted"
          title={t("message.sending")}
        >
          <span className="sr-only">{t("message.sending")}</span>
          <span
            className="bg-text-muted/60 size-2 shrink-0 animate-pulse rounded-full"
            aria-hidden
          />
        </span>
      );
    }
    const failedOptimistic = message.id < 0;
    const showRetry = failedOptimistic && onRetryFailedOutgoing != null;
    const showRemove = failedOptimistic && onRemoveFailedOutgoing != null;
    return (
      <span
        data-testid={`message-delivery-${message.id}`}
        className="inline-flex items-center gap-0.5"
      >
        {showRetry && (
          <button
            type="button"
            className="rounded-sm text-text-muted hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
            title={t("message.retrySend")}
            aria-label={t("message.retrySend")}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onRetryFailedOutgoing?.(message);
            }}
          >
            <Icon name="send" size={14} className="shrink-0" />
          </button>
        )}
        {showRemove && (
          <button
            type="button"
            className="rounded-sm text-text-muted hover:text-notice-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
            title={t("message.removeFailedSend")}
            aria-label={t("message.removeFailedSend")}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onRemoveFailedOutgoing?.(message);
            }}
          >
            <Icon name="delete" size={14} className="shrink-0" />
          </button>
        )}
        {!showRetry && !showRemove && (
          <span className="text-[11px] text-notice-base" title={t("message.notDelivered")}>
            {t("message.notDelivered")}
          </span>
        )}
      </span>
    );
  },
);
