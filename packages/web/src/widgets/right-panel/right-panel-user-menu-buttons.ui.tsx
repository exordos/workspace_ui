import React from "react";
import { Icon } from "~/shared/ui/icon";
import type { MenuButtonProps, OptionButtonProps } from "./right-panel-user-menu.types";

/**
 * Flat account-menu row (Figma right menu): icon + label/subtitle + trailing value/chevron.
 * No card wells around icons — the section list provides dividers.
 *
 * Root rows use `px-4`; nested rows bleed through the parent `px-2` while keeping
 * their content aligned to the same inset.
 */
export const RightPanelUserMenuMenuButton: React.FC<MenuButtonProps> = ({
  label,
  icon,
  iconSize = 22,
  subtitle,
  right,
  onClick,
  disabled = false,
  tone = "default",
  variant = "root",
  id,
  testId,
  ariaLabel,
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
      aria-controls={ariaControls}
      aria-expanded={ariaExpanded}
      className={`flex items-center justify-between gap-2 py-1.5 text-left transition-colors hover:bg-sidebar-hover disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent ${
        variant === "nested" ? "-mx-2 w-[calc(100%+1rem)] px-2" : "w-full px-4"
      } ${isDanger ? "text-danger" : "text-text-primary"}`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center ${
            isDanger ? "text-danger" : "text-text-secondary"
          }`}
        >
          <Icon name={icon} size={iconSize} className="text-current" />
        </span>
        <span className="min-w-0">
          <span
            className={`block text-sm ${
              variant === "nested" ? "font-normal leading-4" : "font-medium leading-5"
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

/** Inline accordion option row — same flat list language as the parent menu. */
export const RightPanelUserMenuOptionButton: React.FC<OptionButtonProps> = ({
  label,
  active,
  onClick,
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="flex w-full items-center justify-between gap-3 px-0 py-0 text-left text-sm leading-4 transition-colors hover:bg-sidebar-hover"
    >
      <span className={active ? "font-medium text-text-primary" : "text-text-primary"}>
        {label}
      </span>
      {active ? <Icon name="check" size={16} className="text-accent" /> : null}
    </button>
  );
};
