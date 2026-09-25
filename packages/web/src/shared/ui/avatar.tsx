import React, { useEffect, useState } from "react";
import { PresenceIndicator } from "./presence-indicator";
import type { AvatarProps, AvatarSize } from "./avatar.types";
import type { CSSProperties } from "react";

const SIZE_CLASS: Record<AvatarSize, string> = {
  xs: "w-9 h-9 text-xs",
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-xs",
  lg: "w-12 h-12 text-lg",
  // Profile / personal-info header — matches Figma avatar 64×64
  xl: "w-16 h-16 text-xl",
};

/**
 * Кликабельный аватар: кольцо на hover родителя `group` + курсор-«пальчик».
 * Presence-бейдж рядом тоже попадает в group-hover.
 */
const INTERACTIVE_CLASS =
  "cursor-pointer transition-shadow duration-150 group-hover:ring-2 group-hover:ring-accent-soft group-hover:ring-offset-1 group-hover:ring-offset-bg";

// The 14.65% inset places the badge center on the circle at 45 degrees.
const PRESENCE_POSITION_CLASS =
  "pointer-events-none absolute bottom-[calc(14.65%-4px)] right-[calc(14.65%-4px)]";
const DEACTIVATED_POSITION_CLASS =
  "pointer-events-none absolute bottom-[calc(14.65%-7px)] right-[calc(14.65%-7px)]";

const AvatarImage = React.memo<{
  baseClass: string;
  src: string;
  imageLoading: "eager" | "lazy";
  onError: () => void;
  style?: CSSProperties;
}>(({ baseClass, src, imageLoading, onError, style }) => {
  return (
    <div className={baseClass} style={style}>
      <img
        src={src}
        alt=""
        className="h-full w-full object-cover"
        loading={imageLoading}
        decoding="async"
        onError={onError}
      />
    </div>
  );
});

export const Avatar = React.memo<AvatarProps>(
  ({
    size = "md",
    src,
    imageLoading = "lazy",
    interactive = false,
    presence,
    deactivated = false,
    children,
    className = "",
    style,
  }) => {
    const sizeClass = SIZE_CLASS[size];
    const interactiveClass = interactive ? INTERACTIVE_CLASS : "";
    const baseClass =
      `flex-shrink-0 rounded-full bg-bg border border-border-subtle flex items-center justify-center overflow-hidden font-semibold text-text-primary ${sizeClass} ${interactiveClass} ${className}`.trim();
    const trimmedSrc = src?.trim();
    const [imageFailed, setImageFailed] = useState(false);

    useEffect(() => {
      setImageFailed(false);
    }, [trimmedSrc]);

    const avatar =
      trimmedSrc != null && trimmedSrc.length > 0 && !imageFailed ? (
        <AvatarImage
          baseClass={baseClass}
          src={trimmedSrc}
          imageLoading={imageLoading}
          onError={() => setImageFailed(true)}
          style={style}
        />
      ) : (
        <div className={baseClass} style={style}>
          {children}
        </div>
      );

    if (presence == null && !deactivated) return avatar;

    return (
      <span className="relative inline-flex shrink-0">
        {avatar}
        <PresenceIndicator
          status={presence ?? null}
          deactivated={deactivated}
          size={deactivated ? "md" : "sm"}
          className={deactivated ? DEACTIVATED_POSITION_CLASS : PRESENCE_POSITION_CLASS}
        />
      </span>
    );
  },
);
