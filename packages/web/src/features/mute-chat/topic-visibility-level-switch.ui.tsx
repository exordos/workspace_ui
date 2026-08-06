import React, { useCallback, useMemo } from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import {
  getNotificationLevelSwitchSizeStyles,
  getTopicVisibilityLevelOptions,
  type NotificationLevelSwitchSize,
  type TopicVisibilityLevelOption,
} from "./notification-level.ui.lib";
import type { TopicVisibilityLevel } from "./notification-level.lib";

export interface TopicVisibilityLevelSwitchProps {
  value: TopicVisibilityLevel;
  onChange: (level: TopicVisibilityLevel) => void;
  streamMuted: boolean;
  topicExplicitlyUnmuted: boolean;
  disabled?: boolean;
  /** sm = menus, md = dialogs, lg = info panel (Figma). */
  size?: NotificationLevelSwitchSize;
  className?: string;
}

export const TopicVisibilityLevelSwitch = React.memo<TopicVisibilityLevelSwitchProps>(
  ({
    value,
    onChange,
    streamMuted,
    topicExplicitlyUnmuted,
    disabled = false,
    size = "md",
    className,
  }) => {
    const options = useMemo(
      () => getTopicVisibilityLevelOptions(streamMuted, topicExplicitlyUnmuted),
      [streamMuted, topicExplicitlyUnmuted],
    );

    const handleSelect = useCallback(
      (level: TopicVisibilityLevel) => {
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
        aria-label={t("channel.topicNotifications")}
        className={`${containerClass} ${className ?? ""}`}
      >
        {options.map((option) => (
          <TopicVisibilitySegment
            key={option.level}
            option={option}
            selected={value === option.level}
            disabled={disabled}
            iconSize={iconSize}
            segmentButtonClass={segmentButtonClass}
            onSelect={handleSelect}
          />
        ))}
      </div>
    );
  },
);

TopicVisibilityLevelSwitch.displayName = "TopicVisibilityLevelSwitch";

interface TopicVisibilitySegmentProps {
  option: TopicVisibilityLevelOption;
  selected: boolean;
  disabled: boolean;
  iconSize: number;
  segmentButtonClass: string;
  onSelect: (level: TopicVisibilityLevel) => void;
}

const TopicVisibilitySegment = React.memo<TopicVisibilitySegmentProps>(
  ({ option, selected, disabled, iconSize, segmentButtonClass, onSelect }) => {
    const label = t(option.labelKey);
    return (
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={() => onSelect(option.level)}
        className={`focus-visible:ring-accent/40 flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 ${segmentButtonClass} ${
          selected
            ? "bg-card-bg text-text-primary"
            : "text-text-muted hover:bg-sidebar-hover hover:text-text-primary"
        } disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <Icon name={option.icon} size={iconSize} className="shrink-0 text-current" />
      </button>
    );
  },
);

TopicVisibilitySegment.displayName = "TopicVisibilitySegment";
