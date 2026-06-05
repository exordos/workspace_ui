// Shared floating scroll-to-bottom button so feed and message-list share the same UI and behavior.
import React from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "./icon";
import { UnreadCountBadge } from "./unread-count-badge";

// Parent controls visibility, click handler, and optional unread badge count.
interface FloatingScrollToBottomButtonProps {
  onClick: () => void;
  unreadCount?: number;
}

function resolveAriaLabel(unreadCount: number): string {
  if (unreadCount <= 0) {
    return t("a11y.scrollToBottom");
  }
  return t("a11y.scrollToBottomWithUnread", { count: unreadCount });
}

// Renders the scroll-to-bottom control in the standard overlay position.
export const FloatingScrollToBottomButton: React.FC<FloatingScrollToBottomButtonProps> = ({
  onClick,
  unreadCount = 0,
}) => {
  const showBadge = unreadCount > 0;

  return (
    <div className="absolute bottom-4 right-4 z-float">
      <button
        type="button"
        onClick={onClick}
        className="hover:bg-bg-elevated/90 relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-bg-elevated text-text-primary shadow-lg focus:outline-none focus:ring-2 focus:ring-accent-soft"
        aria-label={resolveAriaLabel(unreadCount)}
      >
        <Icon name="chevron-down" className="h-5 w-5" />
        {showBadge ? (
          <span className="pointer-events-none absolute -right-2 -top-3.5 z-sticky">
            <UnreadCountBadge count={unreadCount} />
          </span>
        ) : null}
      </button>
    </div>
  );
};
