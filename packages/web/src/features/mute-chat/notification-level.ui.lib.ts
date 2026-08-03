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
