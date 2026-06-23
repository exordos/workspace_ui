import React, { useCallback } from "react";
import { t } from "~/i18n/i18n";
import { chatBottomNoticeBarClassName } from "~/shared/lib/chat-bottom-notice-bar.lib";
import { Icon } from "~/shared/ui/icon";
import type { ChatPageInlineAlertsProps } from "./chat-page-inline-alerts.types";

interface InlineAlertBarProps {
  message: string;
  onDismiss: () => void;
  divided?: boolean;
  round?: "all" | "top" | "bottom";
}

/** Single inline alert row with dismiss control. */
const InlineAlertBar = React.memo(function InlineAlertBar({
  message,
  onDismiss,
  divided = false,
  round = "all",
}: InlineAlertBarProps) {
  const handleDismiss = useCallback(() => {
    onDismiss();
  }, [onDismiss]);

  return (
    <div
      role="alert"
      className={`${chatBottomNoticeBarClassName({ round, divided })} text-sm text-notice-base`}
    >
      <span className="min-w-0 flex-1">{message}</span>
      <button
        type="button"
        onClick={handleDismiss}
        className="hover:bg-notice-base/20 shrink-0 rounded p-0.5 opacity-80 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        aria-label={t("common.close")}
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
});

export const ChatPageInlineAlerts = React.memo(function ChatPageInlineAlerts({
  routeResolveError,
  actionError,
  sendError,
  onDismissRouteResolveError,
  onDismissActionError,
  onDismissSendError,
}: ChatPageInlineAlertsProps) {
  return (
    <>
      {routeResolveError && (
        <InlineAlertBar
          message={routeResolveError}
          onDismiss={onDismissRouteResolveError}
          round={actionError || sendError ? "top" : "all"}
        />
      )}
      {actionError && (
        <InlineAlertBar
          message={actionError}
          onDismiss={onDismissActionError}
          divided={routeResolveError != null}
          round={sendError ? "top" : routeResolveError ? "bottom" : "all"}
        />
      )}
      {sendError && (
        <InlineAlertBar
          message={sendError}
          onDismiss={onDismissSendError}
          divided={actionError != null || routeResolveError != null}
          round={actionError || routeResolveError ? "bottom" : "all"}
        />
      )}
    </>
  );
});
