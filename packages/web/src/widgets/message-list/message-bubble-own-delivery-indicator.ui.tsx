import React from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import type { MessageBubbleOwnDeliveryIndicatorProps } from "./message-bubble-own-delivery-indicator.types";

export const MessageBubbleOwnDeliveryIndicator = React.memo(
  function MessageBubbleOwnDeliveryIndicator({
    message,
    status,
    onViews,
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
          className="text-[11px] text-text-muted"
          title={t("message.sending")}
        >
          {t("message.sending")}
        </span>
      );
    }
    return (
      <span
        data-testid={`message-delivery-${message.id}`}
        className="text-[11px] text-notice-base"
        title={t("message.notDelivered")}
      >
        {t("message.notDelivered")}
      </span>
    );
  },
);
