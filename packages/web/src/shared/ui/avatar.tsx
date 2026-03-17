import React from "react";

const SIZE_CLASS = {
  xs: "w-9 h-9 text-xs",
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-xs",
  lg: "w-12 h-12 text-lg",
} as const;

interface AvatarProps {
  size?: keyof typeof SIZE_CLASS;
  /** Avatar image URL. When provided, renders an image; otherwise renders children (e.g. an initial). */
  src?: string | null;
  children: React.ReactNode;
  className?: string;
}

export const Avatar = React.memo<AvatarProps>(({ size = "md", src, children, className = "" }) => {
  const sizeClass = SIZE_CLASS[size];
  const baseClass =
    `flex-shrink-0 rounded-full bg-bg border border-border-subtle flex items-center justify-center overflow-hidden font-semibold text-text-primary ${sizeClass} ${className}`.trim();
  if (src) {
    return (
      <div className={baseClass}>
        <img src={src} alt="" className="h-full w-full object-cover" />
      </div>
    );
  }
  return <div className={baseClass}>{children}</div>;
});
