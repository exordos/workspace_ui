/**
 * Renders the custom status emoji glyph next to a chat title (DM sidebar rows).
 * Does not render status text — only the emoji picture/character from the messenger API payload.
 */
import React from "react";
import { useUserStatusEmojiDisplay } from "~/entities/user/user-status.hooks";
import type { UserStatus } from "~/entities/user/user.model";

export interface SidebarUserStatusEmojiProps {
  status: UserStatus | null | undefined;
}

export const SidebarUserStatusEmoji = React.memo<SidebarUserStatusEmojiProps>(
  function SidebarUserStatusEmoji({ status }) {
    const emojiDisplay = useUserStatusEmojiDisplay(status);
    if (emojiDisplay == null) {
      return null;
    }
    if (emojiDisplay.kind === "image") {
      return (
        <img
          src={emojiDisplay.src}
          alt={emojiDisplay.alt}
          title={emojiDisplay.alt}
          className="h-4 w-4 shrink-0 rounded-sm object-contain"
          data-testid="sidebar-user-status-emoji"
        />
      );
    }
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center text-[15px] leading-none"
        aria-hidden
        data-testid="sidebar-user-status-emoji"
      >
        {emojiDisplay.text}
      </span>
    );
  },
);
