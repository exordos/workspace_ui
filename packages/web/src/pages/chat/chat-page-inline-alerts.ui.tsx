import React from "react";

export interface ChatPageInlineAlertsProps {
  actionError: string | null;
  sendError: string | null;
}

export const ChatPageInlineAlerts = React.memo(function ChatPageInlineAlerts({
  actionError,
  sendError,
}: ChatPageInlineAlertsProps) {
  return (
    <>
      {actionError && (
        <div
          className="bg-notice-base/10 flex-shrink-0 border-t border-border-subtle px-4 py-2 text-sm text-notice-base"
          role="alert"
        >
          {actionError}
        </div>
      )}
      {sendError && (
        <div
          className="bg-notice-base/10 flex-shrink-0 border-t border-border-subtle px-4 py-2 text-sm text-notice-base"
          role="alert"
        >
          {sendError}
        </div>
      )}
    </>
  );
});
