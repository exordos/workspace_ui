import React from "react";
import type { AvatarProps, AvatarSize } from "./avatar.types";

const SIZE_CLASS: Record<AvatarSize, string> = {
  xs: "w-9 h-9 text-xs",
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-xs",
  lg: "w-12 h-12 text-lg",
};

export const Avatar = React.memo<AvatarProps>(
  ({ size = "md", src, imageLoading = "lazy", children, className = "" }) => {
    const sizeClass = SIZE_CLASS[size];
    const baseClass =
      `flex-shrink-0 rounded-full bg-bg border border-border-subtle flex items-center justify-center overflow-hidden font-semibold text-text-primary ${sizeClass} ${className}`.trim();
    if (src) {
      return (
        <div className={baseClass}>
          <img
            src={src}
            alt=""
            className="h-full w-full object-cover"
            loading={imageLoading}
            decoding="async"
          />
        </div>
      );
    }
    return <div className={baseClass}>{children}</div>;
  },
);
