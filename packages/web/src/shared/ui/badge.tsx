import React from "react";
import type { BadgeProps, BadgeVariant } from "./badge.types";

const VARIANT_CLASS: Record<BadgeVariant, string> = {
  muted: "bg-bg-elevated text-text-muted border-0",
  unread: "bg-sidebar-unread text-badge-text border-0",
};

export const Badge = React.memo<BadgeProps>(
  ({ count, variant = "unread", rounded = "full", className = "" }) => {
    const roundedClass = rounded === "full" ? "rounded-full" : "rounded-md";
    return (
      <span
        className={`flex h-5 min-w-[20px] items-center justify-center px-1.5 text-[11px] font-medium ${roundedClass} ${VARIANT_CLASS[variant]} ${className}`.trim()}
      >
        {count}
      </span>
    );
  },
);
