import React from "react";

export type TooltipSide = "top" | "bottom";

export interface TooltipProps {
  label: string;
  side?: TooltipSide;
  children: React.ReactElement;
}

const SIDE_OFFSET_CLASS: Record<TooltipSide, string> = {
  top: "bottom-full mb-1.5",
  bottom: "top-full mt-1.5",
};

/**
 * Lightweight hover/focus tooltip for icon buttons.
 * CSS-only — native `title` is unreliable in Electron.
 */
export const Tooltip: React.FC<TooltipProps> = ({ label, side = "bottom", children }) => (
  <span className="group/tooltip relative inline-flex">
    {children}
    <span
      role="tooltip"
      className={`pointer-events-none absolute left-1/2 z-dropdown -translate-x-1/2 whitespace-nowrap rounded-md border border-border-subtle bg-bg-elevated px-2 py-1 text-xs text-text-primary opacity-0 shadow-md transition-opacity duration-150 group-focus-within/tooltip:opacity-100 group-hover/tooltip:opacity-100 ${SIDE_OFFSET_CLASS[side]}`}
    >
      {label}
    </span>
  </span>
);
