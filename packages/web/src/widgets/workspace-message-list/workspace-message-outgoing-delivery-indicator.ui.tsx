import React from "react";
import type { MessengerOutgoingMessage } from "~/entities/messenger/messenger-outbox.types";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";

interface WorkspaceMessageOutgoingDeliveryIndicatorProps {
  message: MessengerOutgoingMessage;
  onRetry?: (localId: string) => void;
  onRemove?: (localId: string) => void;
}

export const WorkspaceMessageOutgoingDeliveryIndicator = React.memo(
  function WorkspaceMessageOutgoingDeliveryIndicator({
    message,
    onRetry,
    onRemove,
  }: WorkspaceMessageOutgoingDeliveryIndicatorProps): React.ReactElement {
    if (message.status === "uploading" || message.status === "sending") {
      const label = message.status === "uploading" ? t("message.uploading") : t("message.sending");
      return (
        <span
          className="inline-flex size-3.5 items-center justify-center text-text-muted"
          title={label}
          aria-label={label}
          data-outgoing-delivery-status={message.status}
        >
          <span className="sr-only">{label}</span>
          <Icon name="more" size={12} className="text-current" />
        </span>
      );
    }

    return (
      <span
        className="inline-flex items-center gap-0.5"
        title={message.error ?? t("message.notDelivered")}
        data-outgoing-delivery-status="failed"
      >
        {onRetry != null ? (
          <button
            type="button"
            className="rounded-sm text-text-muted hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
            title={t("message.retrySend")}
            aria-label={t("message.retrySend")}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onRetry(message.localId);
            }}
          >
            <Icon name="send" size={14} className="shrink-0" />
          </button>
        ) : null}
        {onRemove != null ? (
          <button
            type="button"
            className="rounded-sm text-text-muted hover:text-notice-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
            title={t("message.removeFailedSend")}
            aria-label={t("message.removeFailedSend")}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onRemove(message.localId);
            }}
          >
            <Icon name="delete" size={14} className="shrink-0" />
          </button>
        ) : null}
        {onRetry == null && onRemove == null ? (
          <span className="text-[11px] text-notice-base">{t("message.notDelivered")}</span>
        ) : null}
      </span>
    );
  },
);
