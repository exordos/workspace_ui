import React from "react";
import { Icon } from "~/shared/ui/icon";
import type { PanelMenuRowProps } from "./panel-menu-row.types";

/**
 * Flat sidebar menu row: icon + label/subtitle + trailing value/chevron.
 * No card wells around icons — the section list provides dividers.
 *
 * Root rows use `px-4`; nested rows bleed through the parent `px-2` while keeping
 * their content aligned to the same inset.
 */
export const PanelMenuRow: React.FC<PanelMenuRowProps> = ({
  label,
  icon,
  iconSize = 22,
  subtitle,
  right,
  onClick,
  disabled = false,
  tone = "default",
  variant = "root",
  density = "regular",
  id,
  testId,
  ariaLabel,
  role,
  "aria-checked": ariaChecked,
  "aria-controls": ariaControls,
  "aria-expanded": ariaExpanded,
}) => {
  const isDanger = tone === "danger";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      id={id}
      data-testid={testId}
      aria-label={ariaLabel}
      role={role}
      aria-checked={ariaChecked}
      aria-controls={ariaControls}
      aria-expanded={ariaExpanded}
      className={`flex items-center justify-between gap-2 text-left transition-colors hover:bg-sidebar-hover disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent ${
        density === "compact" ? "h-10 py-0" : "py-1.5"
      } ${
        variant === "nested" ? "-mx-2 w-[calc(100%+1rem)] px-2" : "w-full px-4"
      } ${isDanger ? "text-danger" : "text-text-primary"}`}
    >
      <span className="flex min-h-8 min-w-0 items-center gap-2">
        {icon != null ? (
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center ${
              isDanger ? "text-danger" : "text-text-secondary"
            }`}
          >
            <Icon name={icon} size={iconSize} className="text-current" />
          </span>
        ) : null}
        <span className="min-w-0">
          <span
            className={`block text-sm ${
              variant === "nested" || density === "compact"
                ? "font-normal leading-5"
                : "font-medium leading-5"
            } ${isDanger ? "text-danger" : "text-text-primary"}`}
          >
            {label}
          </span>
          {subtitle ? (
            <span
              className={`${variant === "nested" ? "mt-1 text-xs" : "mt-0.5 text-sm"} block leading-5 text-text-muted`}
            >
              {subtitle}
            </span>
          ) : null}
        </span>
      </span>
      {right}
    </button>
  );
};
