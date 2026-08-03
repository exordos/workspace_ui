import React from "react";
import { Icon } from "~/shared/ui/icon";
import type { MenuButtonProps, OptionButtonProps } from "./right-panel-user-menu.types";

/**
 * Flat account-menu row (Figma right menu): icon + label/subtitle + trailing value/chevron.
 * No card wells around icons — the section list provides dividers.
 *
 * `px-4` insets content; hover fill spans the flushed content width (RightDrawer contentFlush).
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
  testId,
  ariaLabel,
}) => {
  const isDanger = tone === "danger";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      aria-label={ariaLabel}
      className={`flex w-full items-center justify-between gap-2 px-4 py-1.5 text-left transition-colors hover:bg-sidebar-hover disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent ${
        isDanger ? "text-danger" : "text-text-primary"
      }`}
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
            className={`block text-sm font-medium leading-5 ${
              isDanger ? "text-danger" : "text-text-primary"
            }`}
          >
            {label}
          </span>
          {subtitle ? (
            <span className="mt-0.5 block text-sm leading-5 text-text-muted">{subtitle}</span>
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
      className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm transition-colors hover:bg-sidebar-hover"
    >
      <span className={active ? "font-medium text-text-primary" : "text-text-primary"}>
        {label}
      </span>
      {active ? <Icon name="check" size={14} className="text-accent" /> : null}
    </button>
  );
};
