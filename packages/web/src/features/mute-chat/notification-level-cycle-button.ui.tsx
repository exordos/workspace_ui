import React, { useCallback } from "react";
import { Icon } from "~/shared/ui/icon";
import type { IconName } from "~/shared/ui/icon";
export interface NotificationLevelCycleButtonProps {
  value: string;
  onCycle: () => void;
  icon: IconName;
  label: string;
  disabled?: boolean;
  className?: string;
  /** Shown on hover in sidebar rows. */
  showOnRowHover?: boolean;
  /** Row-hover hide when value matches (topics: inherit). */
  inactiveOnRowHover?: string;
}

export const NotificationLevelCycleButton = React.memo<NotificationLevelCycleButtonProps>(
  ({
    value,
    onCycle,
    icon,
    label,
    disabled = false,
    className,
    showOnRowHover = false,
    inactiveOnRowHover = "default",
  }) => {
    const handleClick = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) onCycle();
      },
      [disabled, onCycle],
    );

    const hideUntilRowHover = showOnRowHover && value === inactiveOnRowHover && !disabled;
    const hoverClass = hideUntilRowHover
      ? "opacity-0 transition-opacity focus-visible:opacity-100 group-focus-within/topic:opacity-100 group-hover/topic:opacity-100"
      : "";

    return (
      <button
        type="button"
        disabled={disabled}
        onClick={handleClick}
        aria-label={label}
        title={label}
        className={`focus-visible:ring-accent/40 flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-muted transition-colors hover:bg-sidebar-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${hoverClass} ${className ?? ""}`}
      >
        <Icon name={icon} size={14} className="shrink-0 text-current" />
      </button>
    );
  },
);

NotificationLevelCycleButton.displayName = "NotificationLevelCycleButton";
