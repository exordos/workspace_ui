import type { IconName } from "~/shared/ui/icon";
import type { NotificationLevel, TopicVisibilityLevel } from "./notification-level.lib";

/** Topic notification options shared by the Workspace sidebar controls. */

type StreamNotificationLabelKey =
  | "channel.notificationDefault"
  | "channel.notificationMuted"
  | "channel.notificationSubscribed";

type TopicVisibilityLabelKey =
  | "channel.topicVisibilityMuted"
  | "channel.topicVisibilityDefault"
  | "channel.topicVisibilityUnmuted"
  | "channel.topicVisibilityFollowed";

export interface NotificationLevelOption {
  level: NotificationLevel;
  icon: IconName;
  labelKey: StreamNotificationLabelKey;
}

export interface TopicVisibilityLevelOption {
  level: TopicVisibilityLevel;
  icon: IconName;
  labelKey: TopicVisibilityLabelKey;
}

/**
 * Visual density for segmented notification switches.
 * Context-agnostic: sm = dropdowns, md = dialogs, lg = info panels (Figma).
 */
export type NotificationLevelSwitchSize = "sm" | "md" | "lg";

export interface NotificationLevelSwitchSizeStyles {
  iconSize: number;
  containerClass: string;
  segmentButtonClass: string;
}

/** Shared layout tokens — no outer border, no selected ring (Figma Exordos Core). */
export const NOTIFICATION_LEVEL_SWITCH_SIZE_STYLES: Record<
  NotificationLevelSwitchSize,
  NotificationLevelSwitchSizeStyles
> = {
  // Half padding (p-0.5) for compact menus
  sm: {
    iconSize: 14,
    containerClass: "flex gap-0.5 rounded-md bg-bg p-0.5",
    segmentButtonClass: "h-7 min-w-7 flex-1 rounded-md",
  },
  md: {
    iconSize: 18,
    containerClass: "flex gap-1 rounded-lg bg-bg p-1",
    segmentButtonClass: "h-8 min-w-8 flex-1 rounded-lg",
  },
  // Info panel: 28px icons, 4px pad, 8px gap — button group height 44px (Figma)
  lg: {
    iconSize: 28,
    containerClass: "flex gap-2 rounded-lg bg-bg p-1",
    segmentButtonClass: "h-9 min-w-0 flex-1 rounded-lg",
  },
};

export function getNotificationLevelSwitchSizeStyles(
  size: NotificationLevelSwitchSize = "md",
): NotificationLevelSwitchSizeStyles {
  return NOTIFICATION_LEVEL_SWITCH_SIZE_STYLES[size];
}

const STREAM_NOTIFICATION_OPTION_BY_LEVEL: Record<NotificationLevel, NotificationLevelOption> = {
  default: { level: "default", icon: "at", labelKey: "channel.notificationDefault" },
  muted: { level: "muted", icon: "bell_off", labelKey: "channel.notificationMuted" },
  subscribed: {
    level: "subscribed",
    icon: "bell",
    labelKey: "channel.notificationSubscribed",
  },
};

export const STREAM_NOTIFICATION_LEVEL_OPTIONS: readonly NotificationLevelOption[] = [
  STREAM_NOTIFICATION_OPTION_BY_LEVEL.default,
  STREAM_NOTIFICATION_OPTION_BY_LEVEL.muted,
  STREAM_NOTIFICATION_OPTION_BY_LEVEL.subscribed,
];

const TOPIC_VISIBILITY_OPTION_BY_LEVEL: Record<TopicVisibilityLevel, TopicVisibilityLevelOption> = {
  muted: { level: "muted", icon: "topic_mute", labelKey: "channel.topicVisibilityMuted" },
  inherit: { level: "inherit", icon: "topic_inherit", labelKey: "channel.topicVisibilityDefault" },
  unmuted: { level: "unmuted", icon: "at", labelKey: "channel.topicVisibilityUnmuted" },
  followed: {
    level: "followed",
    icon: "topic_follow",
    labelKey: "channel.topicVisibilityFollowed",
  },
};

export function getStreamNotificationLevelOption(
  level: NotificationLevel,
): NotificationLevelOption {
  return STREAM_NOTIFICATION_OPTION_BY_LEVEL[level];
}

export function getTopicVisibilityLevelOption(
  level: TopicVisibilityLevel,
): TopicVisibilityLevelOption {
  return TOPIC_VISIBILITY_OPTION_BY_LEVEL[level];
}

export function shouldShowTopicUnmuteOption(
  streamMuted: boolean,
  topicExplicitlyUnmuted: boolean,
): boolean {
  return streamMuted || topicExplicitlyUnmuted;
}

export function getTopicVisibilityLevelOptions(
  streamMuted: boolean,
  topicExplicitlyUnmuted: boolean,
): readonly TopicVisibilityLevelOption[] {
  const levels: TopicVisibilityLevel[] = ["muted", "inherit"];
  if (shouldShowTopicUnmuteOption(streamMuted, topicExplicitlyUnmuted)) {
    levels.push("unmuted");
  }
  levels.push("followed");
  return levels.map((level) => TOPIC_VISIBILITY_OPTION_BY_LEVEL[level]);
}
