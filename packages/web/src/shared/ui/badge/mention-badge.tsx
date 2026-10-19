import React from "react";
import type { BadgeSize } from "./badge.types";

const SIZE_CLASS: Record<BadgeSize, string> = {
  default: "h-5 min-w-[20px] px-1.5 text-[11px]",
  sm: "h-4 min-w-4 px-1 text-[10px]",
};

export interface MentionBadgeProps {
  size?: BadgeSize;
  className?: string;
}

/** Sidebar indicator for unread @mentions in a chat or topic row. */
export const MentionBadge = React.memo<MentionBadgeProps>(
  ({ size = "default", className = "" }) => (
    <span
      aria-hidden
      className={`flex items-center justify-center rounded-full border-0 bg-sidebar-unread font-medium leading-none text-badge-text ${SIZE_CLASS[size]} ${className}`.trim()}
      title="@"
    >
      @
    </span>
  ),
);
