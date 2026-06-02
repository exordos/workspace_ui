import React from "react";
import { Badge } from "~/shared/ui/badge";
import type { BadgeSize } from "~/shared/ui/badge.types";
import { MentionBadge } from "~/shared/ui/mention-badge";

export interface SidebarChatBadgesProps {
  unreadCount?: number;
  hasMention?: boolean;
  size?: BadgeSize;
}

export const SidebarChatBadges = React.memo<SidebarChatBadgesProps>(
  ({ unreadCount, hasMention = false, size = "default" }) => {
    const showUnread = unreadCount !== undefined && unreadCount > 0;
    if (!hasMention && !showUnread) return null;

    return (
      <div className="flex items-center gap-1">
        {hasMention && <MentionBadge size={size} />}
        {showUnread && <Badge count={unreadCount} variant="unread" size={size} />}
      </div>
    );
  },
);
