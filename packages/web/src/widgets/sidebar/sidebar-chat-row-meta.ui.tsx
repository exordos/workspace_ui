import React, { useCallback } from "react";
import { Badge } from "~/shared/ui/badge";
import { Icon } from "~/shared/ui/icon";
import { MentionBadge } from "~/shared/ui/mention-badge";

export interface SidebarChatRowExpandChevronProps {
  expanded: boolean;
  onToggle: () => void;
  ariaLabel: string;
}

export interface SidebarChatRowMetaProps {
  compact?: boolean;
  isPinned?: boolean;
  unreadCount?: number;
  hasMention?: boolean;
  time?: string;
  expandChevron?: SidebarChatRowExpandChevronProps;
}

function SidebarChatRowActionSlot({
  unreadCount,
  expandChevron,
}: {
  unreadCount?: number;
  expandChevron?: SidebarChatRowExpandChevronProps;
}): React.ReactElement | null {
  const showUnread = unreadCount !== undefined && unreadCount > 0;
  const hasExpandChevron = expandChevron != null;

  const handleChevronClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      expandChevron?.onToggle();
    },
    [expandChevron],
  );

  if (!showUnread && !hasExpandChevron) {
    return null;
  }

  return (
    <div className="relative h-5 min-w-5 shrink-0" data-testid="sidebar-chat-row-action-slot">
      {showUnread && (
        <div
          className={`flex h-5 items-center justify-center ${hasExpandChevron ? "group-focus-within/stream:hidden group-hover/stream:hidden" : ""}`}
          data-testid="sidebar-chat-row-unread-badge"
        >
          <Badge count={unreadCount} variant="unread" />
        </div>
      )}
      {hasExpandChevron && (
        <button
          type="button"
          onClick={handleChevronClick}
          className="hover:bg-bg-elevated/80 focus-visible:bg-bg-elevated/80 absolute inset-0 z-10 hidden items-center justify-center rounded-lg text-text-muted hover:text-text-primary focus-visible:text-text-primary group-focus-within/stream:flex group-hover/stream:flex"
          aria-label={expandChevron.ariaLabel}
          data-testid="sidebar-stream-expand-chevron"
        >
          {expandChevron.expanded ? (
            <Icon name="chevron-up" size={16} />
          ) : (
            <Icon name="chevron-down" size={16} />
          )}
        </button>
      )}
    </div>
  );
}

/** Right column: pin, mention, unread/chevron, and message time. */
export const SidebarChatRowMeta = React.memo(function SidebarChatRowMeta({
  compact = false,
  isPinned = false,
  unreadCount,
  hasMention,
  time,
  expandChevron,
}: SidebarChatRowMetaProps) {
  const showTime = !compact && time != null && time !== "";

  return (
    <div
      className={`flex shrink-0 flex-col items-end ${compact ? "min-w-8 gap-0.5" : "min-w-10 justify-between gap-1"}`}
    >
      <div className="flex items-center gap-1">
        {isPinned && <Icon name="pin" size={12} className="shrink-0 text-text-muted" />}
        {hasMention === true && <MentionBadge size="default" />}
        <SidebarChatRowActionSlot unreadCount={unreadCount} expandChevron={expandChevron} />
      </div>
      {showTime && (
        <span className="whitespace-nowrap text-xs tabular-nums text-text-muted">{time}</span>
      )}
    </div>
  );
});
