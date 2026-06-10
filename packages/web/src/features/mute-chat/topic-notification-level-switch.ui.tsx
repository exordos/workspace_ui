import React from "react";
import { NotificationLevelCycleButton } from "~/features/mute-chat/notification-level-cycle-button.ui";
import { getTopicVisibilityLevelOption } from "~/features/mute-chat/notification-level.ui.lib";
import { useTopicVisibilityLevelControl } from "~/features/mute-chat/topic-notification-level.hook";
import { TopicVisibilityLevelSwitch } from "~/features/mute-chat/topic-visibility-level-switch.ui";
import { t } from "~/i18n/i18n";

export interface TopicNotificationLevelCycleButtonProps {
  streamId: number;
  topic: string;
  onError?: (retry: () => void) => void;
  onMuteError?: (retry: () => void) => void;
  className?: string;
}

/** Cycles topic visibility_policy on click — for sidebar topic rows. */
export const TopicNotificationLevelCycleButton = React.memo<TopicNotificationLevelCycleButtonProps>(
  ({ streamId, topic, onError, onMuteError, className }) => {
    const handleError = onError ?? onMuteError;
    const { visibilityLevel, pending, cycleLevel } = useTopicVisibilityLevelControl({
      streamId,
      topic,
      onError: handleError,
    });
    const option = getTopicVisibilityLevelOption(visibilityLevel);
    const label = t(option.labelKey);

    return (
      <NotificationLevelCycleButton
        value={visibilityLevel}
        icon={option.icon}
        label={label}
        disabled={pending}
        size="sm"
        showOnRowHover
        inactiveOnRowHover="inherit"
        className={className}
        onCycle={cycleLevel}
      />
    );
  },
);

TopicNotificationLevelCycleButton.displayName = "TopicNotificationLevelCycleButton";

export interface TopicNotificationLevelMenuPickerProps {
  streamId: number;
  topic: string;
  onError?: (retry: () => void) => void;
}

/** visibility_policy picker — context menu only (3 or 4 segments like Zulip). */
export const TopicNotificationLevelMenuPicker = React.memo<TopicNotificationLevelMenuPickerProps>(
  ({ streamId, topic, onError }) => {
    const { visibilityLevel, streamMuted, topicExplicitlyUnmuted, pending, applyLevel } =
      useTopicVisibilityLevelControl({
        streamId,
        topic,
        onError,
      });

    return (
      <div className="px-2 py-1">
        <p className="mb-1 text-[10px] font-medium text-text-muted">
          {t("channel.topicNotifications")}
        </p>
        <TopicVisibilityLevelSwitch
          value={visibilityLevel}
          streamMuted={streamMuted}
          topicExplicitlyUnmuted={topicExplicitlyUnmuted}
          disabled={pending}
          size="menu"
          onChange={(level) => {
            void applyLevel(level);
          }}
        />
      </div>
    );
  },
);

TopicNotificationLevelMenuPicker.displayName = "TopicNotificationLevelMenuPicker";

/** @deprecated Use TopicNotificationLevelCycleButton or TopicNotificationLevelMenuPicker. */
export const TopicNotificationLevelSwitch = TopicNotificationLevelCycleButton;
