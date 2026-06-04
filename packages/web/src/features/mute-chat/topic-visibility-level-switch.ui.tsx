import React, { useCallback, useMemo } from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import {
  getTopicVisibilityLevelOptions,
  type TopicVisibilityLevelOption,
} from "./notification-level.ui.lib";
import type { TopicVisibilityLevel } from "./notification-level.lib";

export interface TopicVisibilityLevelSwitchProps {
  value: TopicVisibilityLevel;
  onChange: (level: TopicVisibilityLevel) => void;
  streamMuted: boolean;
  topicExplicitlyUnmuted: boolean;
  disabled?: boolean;
  size?: "menu" | "compact" | "default";
  className?: string;
}

export const TopicVisibilityLevelSwitch = React.memo<TopicVisibilityLevelSwitchProps>(
  ({
    value,
    onChange,
    streamMuted,
    topicExplicitlyUnmuted,
    disabled = false,
    size = "default",
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
        aria-label={t("channel.topicNotifications")}
        className={`${containerClass} ${className ?? ""}`}
      >
        {options.map((option) => (
          <TopicVisibilitySegment
            key={option.level}
            option={option}
            selected={value === option.level}
            disabled={disabled}
            segmentSize={segmentSize}
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
  segmentSize: number;
  segmentButtonClass: string;
  onSelect: (level: TopicVisibilityLevel) => void;
}

const TopicVisibilitySegment = React.memo<TopicVisibilitySegmentProps>(
  ({ option, selected, disabled, segmentSize, segmentButtonClass, onSelect }) => {
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
        className={`focus-visible:ring-accent/40 flex items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 ${segmentButtonClass} ${
          selected
            ? "ring-accent/35 bg-accent-soft text-accent ring-1 ring-inset"
            : "text-text-muted hover:bg-sidebar-hover hover:text-text-primary"
        } disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <Icon
          name={option.icon}
          size={segmentSize}
          className={`shrink-0 text-current ${selected ? "text-accent" : ""}`}
        />
      </button>
    );
  },
);

TopicVisibilitySegment.displayName = "TopicVisibilitySegment";
