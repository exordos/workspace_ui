import React from "react";
import { resolveWorkspaceStatusEmojiDisplay } from "~/entities/user/user-selectors.lib";

export interface SidebarUserStatusEmojiProps {
  statusEmoji: string | null | undefined;
}

export const SidebarUserStatusEmoji = React.memo<SidebarUserStatusEmojiProps>(
  function SidebarUserStatusEmoji({ statusEmoji }) {
    const label = resolveWorkspaceStatusEmojiDisplay(statusEmoji);
    if (label == null) {
      return null;
    }
    return (
      <span data-testid="sidebar-user-status-emoji" aria-hidden className="shrink-0 text-xs">
        {label}
      </span>
    );
  },
);
