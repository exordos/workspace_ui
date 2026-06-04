/**
 * Zulip notification levels for channels (subscription) and topics (visibility_policy).
 *
 * Channels use NotificationLevel (3 UI states).
 * Topics use TopicVisibilityLevel (4 Zulip visibility_policy values).
 */

export type NotificationLevel = "default" | "muted" | "subscribed";

/** Maps 1:1 to Zulip user_topics.visibility_policy. */
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

/** Explicit topic override only (matches Zulip visibility_policy, not effective mute). */
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
