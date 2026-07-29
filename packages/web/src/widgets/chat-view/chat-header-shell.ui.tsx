import React from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import type { ChatHeaderActionsProps } from "./chat-header.types";

// Keep header action buttons visually consistent.
const HEADER_ICON_BUTTON_CLASS =
  "cursor-pointer rounded-lg p-2 text-text-muted hover:bg-card-bg-active hover:text-text-primary";

const ChatHeaderActions: React.FC<ChatHeaderActionsProps> = ({
  onCallClick,
  onOpenSearch,
  onToggleRightPanel,
  rightPanelOpen = true,
  infoLabel,
}) => (
  <div className="flex items-center gap-1">
    {onCallClick != null && (
      <button
        type="button"
        onClick={onCallClick}
        className={HEADER_ICON_BUTTON_CLASS}
        aria-label={t("call.call")}
      >
        <Icon name="phone" size={20} className="text-current" />
      </button>
    )}
    {onOpenSearch != null && (
      <button
        type="button"
        onClick={onOpenSearch}
        hidden
        className={`hidden ${HEADER_ICON_BUTTON_CLASS}`}
        aria-label={t("search.search")}
      >
        {/* This icon fills its view box to match the side panel icon weight. */}
        <Icon name="search" size={20} className="text-current" />
      </button>
    )}
    {onToggleRightPanel != null && (
      <button
        type="button"
        onClick={onToggleRightPanel}
        className={HEADER_ICON_BUTTON_CLASS}
        aria-label={rightPanelOpen ? t("a11y.hidePanel") : infoLabel}
      >
        {/* The side panel icon makes the open and close action explicit. */}
        <Icon name="sidePanel" size={20} className="text-current" />
      </button>
    )}
  </div>
);

interface ChatHeaderShellProps extends ChatHeaderActionsProps {
  /** Channel title or direct partner content. */
  children: React.ReactNode;
}

/** Shared header shell with content and actions. */
export const ChatHeaderShell: React.FC<ChatHeaderShellProps> = ({ children, ...actions }) => (
  <header className="flex flex-shrink-0 items-center justify-between rounded-lg bg-bg-elevated px-5 py-2">
    <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    <ChatHeaderActions {...actions} />
  </header>
);
