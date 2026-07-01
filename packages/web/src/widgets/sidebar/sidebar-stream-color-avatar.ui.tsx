import React from "react";
import { folderColorValueToCssHex } from "~/shared/lib/folder-colors.lib";

type SidebarStreamColorAvatarSize = "sm" | "md";

const SIZE_CLASS: Record<SidebarStreamColorAvatarSize, string> = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-xs",
};

export interface SidebarStreamColorAvatarProps {
  color?: number;
  size: SidebarStreamColorAvatarSize;
}

export const SidebarStreamColorAvatar = React.memo<SidebarStreamColorAvatarProps>(
  function SidebarStreamColorAvatar({ color, size }) {
    const colorStyle: React.CSSProperties | undefined =
      color == null
        ? undefined
        : {
            backgroundColor: folderColorValueToCssHex(color),
            borderColor: folderColorValueToCssHex(color),
            color: "var(--color-bg)",
          };
    return (
      <span
        className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border-subtle font-semibold ${SIZE_CLASS[size]} ${
          color == null ? "bg-bg text-text-primary" : ""
        }`}
        style={colorStyle}
        aria-hidden="true"
      >
        #
      </span>
    );
  },
);
