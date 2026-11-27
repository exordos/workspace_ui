import React, { useCallback } from "react";
import { t } from "~/i18n/i18n";
import {
  CHAT_BOTTOM_NOTICE_DISMISS_BUTTON_CLASS_NAME,
  CHAT_BOTTOM_NOTICE_PREFACE_STRIP_CLASS_NAME,
  chatBottomNoticeBarClassName,
  chatBottomNoticeMarkerClassName,
} from "~/shared/lib/chat-bottom-notice-bar.lib";
import { Icon } from "~/shared/ui/icon";
import type { ChatPageInlineAlertsProps } from "./chat-page-inline-alerts.types";

interface InlineAlertBarProps {
  message: string;
  onDismiss: () => void;
  joinedAbove?: boolean;
  joinedBelow?: boolean;
}

/** Single inline alert — same shell/strip/dismiss chrome as composer reply preface. */
const InlineAlertBar = React.memo(function InlineAlertBar({
  message,
  onDismiss,
  joinedAbove = false,
  joinedBelow = false,
}: InlineAlertBarProps) {
  const handleDismiss = useCallback(() => {
    onDismiss();
  }, [onDismiss]);

  return (
    <div
      role="alert"
      className={chatBottomNoticeBarClassName({
        joinedAbove,
        joinedBelow,
        shellOnly: true,
      })}
    >
      {/* Inner strip mirrors reply chrome so the X aligns with clear-reply. */}
      <div className={CHAT_BOTTOM_NOTICE_PREFACE_STRIP_CLASS_NAME}>
        <span
          className={`absolute bottom-2 left-0 top-2 w-1 rounded-r-full ${chatBottomNoticeMarkerClassName("danger")}`}
          data-notice-marker="danger"
          aria-hidden
        />
        <span className="min-w-0 flex-1 text-sm text-text-primary">{message}</span>
        <button
          type="button"
          onClick={handleDismiss}
          className={CHAT_BOTTOM_NOTICE_DISMISS_BUTTON_CLASS_NAME}
          aria-label={t("common.close")}
        >
          <Icon name="close" size={16} />
        </button>
      </div>
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
  joinedAbove = false,
  joinedBelow = false,
}: ChatPageInlineAlertsProps) {
  const hasRouteResolveError = Boolean(routeResolveError);
  const hasActionError = Boolean(actionError);
  const hasSendError = Boolean(sendError);

  return (
    <>
      {routeResolveError && (
        <InlineAlertBar
          message={routeResolveError}
          onDismiss={onDismissRouteResolveError}
          joinedAbove={joinedAbove}
          joinedBelow={hasActionError || hasSendError || joinedBelow}
        />
      )}
      {actionError && (
        <InlineAlertBar
          message={actionError}
          onDismiss={onDismissActionError}
          joinedAbove={hasRouteResolveError || joinedAbove}
          joinedBelow={hasSendError || joinedBelow}
        />
      )}
      {sendError && (
        <InlineAlertBar
          message={sendError}
          onDismiss={onDismissSendError}
          joinedAbove={hasActionError || hasRouteResolveError || joinedAbove}
          joinedBelow={joinedBelow}
        />
      )}
    </>
  );
});
