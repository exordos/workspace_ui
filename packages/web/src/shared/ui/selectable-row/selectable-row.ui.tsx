import React from "react";
import { sidebarRowClass } from "~/shared/lib/format";

export interface SelectableRowProps {
  children: React.ReactNode;
  active?: boolean;
  as?: "div" | "button";
  className?: string;
  onClick?: () => void;
  type?: "button";
  "aria-label"?: string;
}

const ROW_BASE = "flex items-center gap-2 rounded-lg px-3 py-2 transition-colors";

export const SelectableRow: React.FC<SelectableRowProps> = ({
  children,
  active = false,
  as: Tag = "div",
  className = "",
  onClick,
  type = "button",
  "aria-label": ariaLabel,
}) => {
  const rowClass = `${ROW_BASE} ${sidebarRowClass(active)} ${className}`.trim();

  if (Tag === "button") {
    return (
      <button
        type={type}
        className={`${rowClass} w-full text-left`}
        onClick={onClick}
        aria-label={ariaLabel}
      >
        {children}
      </button>
    );
  }

  return <div className={rowClass}>{children}</div>;
};
