import type { IconName } from "~/shared/ui/icon";
import type { NotificationLevel, TopicVisibilityLevel } from "./notification-level.lib";

/**
 * Zulip user_topics.visibility_policy (topic row / popover order):
 * 1 muted → 0 inherit → 2 unmuted (only if stream muted or topic unmuted) → 3 followed
 */

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

/** Channel subscription: desktop_notifications + is_muted. */
export const STREAM_NOTIFICATION_LEVEL_OPTIONS: readonly NotificationLevelOption[] = [
  { level: "default", icon: "at", labelKey: "channel.notificationDefault" },
  { level: "muted", icon: "bell_off", labelKey: "channel.notificationMuted" },
  { level: "subscribed", icon: "bell", labelKey: "channel.notificationSubscribed" },
];

const TOPIC_VISIBILITY_OPTION_BY_LEVEL: Record<TopicVisibilityLevel, TopicVisibilityLevelOption> = {
  muted: { level: "muted", icon: "topic_mute", labelKey: "channel.topicVisibilityMuted" },
  inherit: { level: "inherit", icon: "topic_inherit", labelKey: "channel.topicVisibilityDefault" },
  unmuted: { level: "unmuted", icon: "topic_unmute", labelKey: "channel.topicVisibilityUnmuted" },
  followed: {
    level: "followed",
    icon: "topic_follow",
    labelKey: "channel.topicVisibilityFollowed",
  },
};

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

export function getNextTopicVisibilityLevel(
  current: TopicVisibilityLevel,
  streamMuted: boolean,
  topicExplicitlyUnmuted: boolean,
): TopicVisibilityLevel {
  const options = getTopicVisibilityLevelOptions(streamMuted, topicExplicitlyUnmuted);
  const levels = options.map((o) => o.level);
  const index = levels.indexOf(current);
  const nextIndex = index < 0 ? 0 : (index + 1) % levels.length;
  return levels[nextIndex]!;
}

export function getTopicVisibilityLevelOption(
  level: TopicVisibilityLevel,
): TopicVisibilityLevelOption {
  return TOPIC_VISIBILITY_OPTION_BY_LEVEL[level];
}
