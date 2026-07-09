/**
 * Notification levels for legacy numeric channels and topics.
 *
 * Channels use NotificationLevel (3 UI states).
 * Topics use TopicVisibilityLevel (4 local visibility override values).
 */

export type NotificationLevel = "default" | "muted" | "subscribed";

/** Local topic visibility override. */
export type TopicVisibilityLevel = "inherit" | "muted" | "unmuted" | "followed";

/** @deprecated Use NotificationLevel — kept for channel call sites. */
export type StreamNotificationLevel = NotificationLevel;

export function deriveStreamNotificationLevel(
  isStreamMuted: boolean,
  perStreamDesktopNotifications: boolean | null,
): NotificationLevel {
  if (isStreamMuted) return "muted";
  if (perStreamDesktopNotifications === true) return "subscribed";
  return "default";
}

/** Explicit topic override only, not effective mute. */
export function deriveTopicVisibilityLevel(
  isTopicFollowed: boolean,
  isTopicMuted: boolean,
  isTopicUnmutedInMutedStream: boolean,
): TopicVisibilityLevel {
  if (isTopicFollowed) return "followed";
  if (isTopicMuted) return "muted";
  if (isTopicUnmutedInMutedStream) return "unmuted";
  return "inherit";
}

/** Effective notification behavior (inherit + muted stream → muted). */
export function deriveTopicNotificationLevel(
  isTopicFollowed: boolean,
  isTopicMuted: boolean,
  isTopicUnmutedInMutedStream: boolean,
  isEffectivelyMuted: boolean,
): NotificationLevel {
  if (isTopicFollowed) return "subscribed";
  if (isTopicMuted) return "muted";
  if (isTopicUnmutedInMutedStream) return "default";
  if (isEffectivelyMuted) return "muted";
  return "default";
}
