import React, { useCallback } from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import {
  STREAM_NOTIFICATION_LEVEL_OPTIONS,
  type NotificationLevelOption,
} from "./notification-level.ui.lib";
import type { NotificationLevel } from "./notification-level.lib";

export interface StreamNotificationLevelSwitchProps {
  value: NotificationLevel;
  onChange: (level: NotificationLevel) => void;
  disabled?: boolean;
  /** menu = context menu; compact = dialogs; default = info panel. */
  size?: "menu" | "compact" | "default";
  className?: string;
  /** i18n key for radiogroup label. */
  groupLabelKey?: "channel.notifications" | "channel.topicNotifications";
  /** Stream vs topic visibility_policy icon set. */
  options?: readonly NotificationLevelOption[];
}

export const StreamNotificationLevelSwitch = React.memo<StreamNotificationLevelSwitchProps>(
  ({
    value,
    onChange,
    disabled = false,
    size = "default",
    className,
    groupLabelKey = "channel.notifications",
    options = STREAM_NOTIFICATION_LEVEL_OPTIONS,
  }) => {
    const handleSelect = useCallback(
      (level: NotificationLevel) => {
        if (disabled || level === value) return;
        onChange(level);
      },
      [disabled, onChange, value],
    );

    const segmentSize = size === "menu" ? 14 : size === "compact" ? 16 : 18;
    const segmentButtonClass =
      size === "menu"
        ? "h-7 min-w-7 flex-1"
        : size === "compact"
          ? "h-8 min-w-8 flex-1"
          : "h-10 min-w-10 flex-1";
    const containerClass =
      size === "menu"
        ? "flex rounded-md border border-border-subtle bg-bg p-0.5"
        : "flex rounded-lg border border-border-subtle bg-bg p-1";

    return (
      <div
        role="radiogroup"
        aria-label={t(groupLabelKey)}
        className={`${containerClass} ${className ?? ""}`}
      >
        {options.map((option) => {
          const selected = value === option.level;
          const label = t(option.labelKey);
          return (
            <button
              key={option.level}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={label}
              title={label}
              disabled={disabled}
              onClick={() => handleSelect(option.level)}
              className={`focus-visible:ring-accent/40 flex items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 ${segmentButtonClass} ${
                selected
                  ? "ring-accent/35 bg-accent-soft text-accent ring-1 ring-inset"
                  : "text-text-muted hover:bg-sidebar-hover hover:text-text-primary"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <Icon
                name={option.icon}
                size={segmentSize}
                className={`shrink-0 ${selected ? "text-accent" : ""}`}
              />
            </button>
          );
        })}
      </div>
    );
  },
);

StreamNotificationLevelSwitch.displayName = "StreamNotificationLevelSwitch";
