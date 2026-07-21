import React from "react";
import { SidebarUserStatusEmoji } from "./sidebar-user-status-emoji.ui";

export interface SidebarChatTitleWithStatusProps {
  title: string;
  statusEmoji?: string | null;
  statusText?: string | null;
}

/**
 * Single-line chat title with optional status.
 *
 * Truncation priority: status text shrinks first; the name only truncates
 * when remaining width is still insufficient after the status has collapsed.
 */
export const SidebarChatTitleWithStatus = React.memo<SidebarChatTitleWithStatusProps>(
  function SidebarChatTitleWithStatus({ title, statusEmoji = null, statusText = null }) {
    const trimmedStatus =
      statusText != null && statusText.trim().length > 0 ? statusText.trim() : null;

    return (
      <span className="flex min-w-0 items-center gap-1 overflow-hidden">
        {/* Low shrink priority: keep the full name while status can still give space */}
        <span
          data-testid="sidebar-chat-title"
          className="min-w-0 shrink truncate text-sm font-medium text-text-primary"
        >
          {title}
        </span>
        {statusEmoji != null ? <SidebarUserStatusEmoji statusEmoji={statusEmoji} /> : null}
        {trimmedStatus != null ? (
          // High shrink priority: absorb almost all flex overflow before the name truncates
          <span
            data-testid="sidebar-chat-status-text"
            className="min-w-0 shrink-[9999] truncate text-xs text-text-muted"
          >
            {trimmedStatus}
          </span>
        ) : null}
      </span>
    );
  },
);
