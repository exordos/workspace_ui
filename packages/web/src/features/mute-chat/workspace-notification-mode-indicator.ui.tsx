import React from "react";
import { t } from "~/i18n/i18n";
import type {
  WorkspaceMessengerStreamNotificationMode,
  WorkspaceMessengerTopicNotificationMode,
} from "~/shared/api/messenger.types";
import { Icon } from "~/shared/ui/icon";
import {
  getStreamNotificationLevelOption,
  getTopicVisibilityLevelOption,
  type NotificationLevelOption,
  type TopicVisibilityLevelOption,
} from "./notification-level.ui.lib";
import type { TopicVisibilityLevel } from "./notification-level.lib";

function NotificationModeIndicator({
  option,
}: Readonly<{
  option: NotificationLevelOption | TopicVisibilityLevelOption;
}>): React.ReactElement {
  const label = t(option.labelKey);

  return (
    <span
      className="flex h-5 w-5 shrink-0 items-center justify-center text-text-muted"
      aria-label={label}
      title={label}
      data-testid="workspace-notification-mode-indicator"
    >
      <Icon name={option.icon} size={12} className="text-current" />
    </span>
  );
}

export const WorkspaceStreamNotificationModeIndicator = React.memo(
  function WorkspaceStreamNotificationModeIndicator({
    mode,
  }: Readonly<{
    mode: WorkspaceMessengerStreamNotificationMode;
  }>): React.ReactElement | null {
    if (mode !== "muted") return null;

    return <NotificationModeIndicator option={getStreamNotificationLevelOption("muted")} />;
  },
);

function mapWorkspaceTopicNotificationModeToLevel(
  mode: Exclude<WorkspaceMessengerTopicNotificationMode, "default">,
): Exclude<TopicVisibilityLevel, "inherit"> {
  switch (mode) {
    case "mute":
      return "muted";
    case "unmute":
      return "unmuted";
    case "follow":
      return "followed";
  }
}

export const WorkspaceTopicNotificationModeIndicator = React.memo(
  function WorkspaceTopicNotificationModeIndicator({
    mode,
  }: Readonly<{
    mode: WorkspaceMessengerTopicNotificationMode;
  }>): React.ReactElement | null {
    if (mode === "default") return null;

    return (
      <NotificationModeIndicator
        option={getTopicVisibilityLevelOption(mapWorkspaceTopicNotificationModeToLevel(mode))}
      />
    );
  },
);
