/**
 * Renders the custom status emoji glyph next to a chat title (DM sidebar rows).
 * Does not render status text — only the emoji picture/character from Zulip payload.
 */
import React from "react";
import type { UserStatus } from "~/entities/user/user.model";
import { getUserStatusEmoji } from "~/entities/user/user-status.lib";

export interface SidebarUserStatusEmojiProps {
  status: UserStatus | null | undefined;
}

export const SidebarUserStatusEmoji = React.memo<SidebarUserStatusEmojiProps>(
  function SidebarUserStatusEmoji({ status }) {
    const emoji = getUserStatusEmoji(status);
    if (emoji == null || emoji.length === 0) {
      return null;
    }
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center text-[15px] leading-none"
        aria-hidden
        data-testid="sidebar-user-status-emoji"
      >
        {emoji}
      </span>
    );
  },
);
