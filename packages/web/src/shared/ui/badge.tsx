import React from "react";
import type { BadgeProps, BadgeSize, BadgeTextTone, BadgeVariant } from "./badge.types";

const VARIANT_BG_CLASS: Record<BadgeVariant, string> = {
  muted: "bg-bg-elevated border-0",
  unread: "bg-sidebar-unread border-0",
};

const VARIANT_TEXT_CLASS: Record<BadgeVariant, string> = {
  muted: "text-text-muted",
  unread: "text-badge-text",
};

const TEXT_TONE_CLASS: Record<BadgeTextTone, string | null> = {
  default: null,
  primary: "text-text-primary",
};

const SIZE_CLASS: Record<BadgeSize, string> = {
  default: "h-5 min-w-[20px] px-1.5 text-[11px]",
  sm: "h-4 min-w-4 px-1 text-[10px]",
};

export const Badge = React.memo<BadgeProps>(
  ({
    count,
    variant = "unread",
    size = "default",
    textTone = "default",
    rounded = "full",
    className = "",
  }) => {
    const roundedClass = rounded === "full" ? "rounded-full" : "rounded-md";
    const textClass = TEXT_TONE_CLASS[textTone] ?? VARIANT_TEXT_CLASS[variant];
    return (
      <span
        className={`flex items-center justify-center font-medium leading-none ${roundedClass} ${SIZE_CLASS[size]} ${VARIANT_BG_CLASS[variant]} ${textClass} ${className}`.trim()}
      >
        {count}
      </span>
    );
  },
);
