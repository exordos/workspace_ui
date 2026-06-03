// Shared floating scroll-to-bottom button so feed and message-list share the same UI and behavior.
import React from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "./icon";

// Parent controls visibility and click handler.
interface FloatingScrollToBottomButtonProps {
  onClick: () => void;
}

// Renders the scroll-to-bottom control in the standard overlay position.
export const FloatingScrollToBottomButton: React.FC<FloatingScrollToBottomButtonProps> = ({
  onClick,
}) => {
  return (
    <div className="absolute bottom-4 right-4 z-float">
      <button
        type="button"
        onClick={onClick}
        className="hover:bg-bg-elevated/90 flex h-10 w-10 items-center justify-center rounded-full border border-border-subtle bg-bg-elevated text-text-primary shadow-lg focus:outline-none focus:ring-2 focus:ring-accent-soft"
        aria-label={t("a11y.scrollToBottom")}
      >
        <Icon name="chevron-down" className="h-5 w-5" />
      </button>
    </div>
  );
};
