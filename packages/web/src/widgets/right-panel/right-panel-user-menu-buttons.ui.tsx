import React from "react";
import { Icon } from "~/shared/ui/icon";
import type { MenuButtonProps, OptionButtonProps } from "./right-panel-user-menu.types";

export const RightPanelUserMenuMenuButton: React.FC<MenuButtonProps> = ({
  label,
  icon,
  subtitle,
  right,
  onClick,
  disabled = false,
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2.5 text-left transition-colors hover:bg-bg-elevated disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border-subtle bg-bg">
          <Icon name={icon} size={18} className="text-accent" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium text-text-primary">{label}</span>
          {subtitle && <span className="mt-0.5 block text-[11px] text-text-muted">{subtitle}</span>}
        </span>
      </span>
      {right}
    </button>
  );
};

export const RightPanelUserMenuOptionButton: React.FC<OptionButtonProps> = ({
  label,
  active,
  onClick,
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-bg"
    >
      <span className={active ? "font-medium text-text-primary" : "text-text-primary"}>
        {label}
      </span>
      {active ? <Icon name="check" size={14} className="text-accent" /> : null}
    </button>
  );
};
