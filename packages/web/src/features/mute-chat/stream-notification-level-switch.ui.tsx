import React, { useCallback } from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import {
  STREAM_NOTIFICATION_LEVEL_OPTIONS,
  getNotificationLevelSwitchSizeStyles,
  type NotificationLevelOption,
  type NotificationLevelSwitchSize,
} from "./notification-level.ui.lib";
import type { NotificationLevel } from "./notification-level.lib";

export interface StreamNotificationLevelSwitchProps {
  value: NotificationLevel;
  onChange: (level: NotificationLevel) => void;
  disabled?: boolean;
  /** sm = menus, md = dialogs, lg = info panel (Figma). */
  size?: NotificationLevelSwitchSize;
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
    size = "md",
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

    const { iconSize, containerClass, segmentButtonClass } =
      getNotificationLevelSwitchSizeStyles(size);

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
              className={`focus-visible:ring-accent/40 flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 ${segmentButtonClass} ${
                selected
                  ? "bg-card-bg text-text-primary"
                  : "text-text-muted hover:bg-sidebar-hover hover:text-text-primary"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <Icon name={option.icon} size={iconSize} className="shrink-0 text-current" />
            </button>
          );
        })}
      </div>
    );
  },
);

StreamNotificationLevelSwitch.displayName = "StreamNotificationLevelSwitch";
