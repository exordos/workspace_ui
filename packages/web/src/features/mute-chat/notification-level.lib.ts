/**
 * Workspace notification levels for streams and topics.
 *
 * Streams use Workspace `notification_mode` values from the gateway backend.
 * Topics use Workspace topic `notification_mode` values from the gateway backend.
 */

import type {
  WorkspaceStreamNotificationMode,
  WorkspaceTopicNotificationMode,
} from "~/shared/api/messenger.types";
import {
  parseWorkspaceStreamNotificationMode,
  WORKSPACE_DEFAULT_STREAM_NOTIFICATION_MODE,
} from "~/shared/lib/stream-notification-resolve.lib";
import {
  parseWorkspaceTopicNotificationMode,
  WORKSPACE_DEFAULT_TOPIC_NOTIFICATION_MODE,
} from "~/shared/lib/topic-notification-resolve.lib";

export type NotificationLevel = "default" | "muted" | "subscribed";
export type StreamNotificationMode = WorkspaceStreamNotificationMode;
export type TopicNotificationMode = WorkspaceTopicNotificationMode;

/** Topic notification mode exposed by the UI. */
export type TopicVisibilityLevel = "inherit" | "muted" | "unmuted" | "followed";

/** @deprecated Use NotificationLevel — kept for channel call sites. */
export type StreamNotificationLevel = NotificationLevel;

export function deriveStreamNotificationLevel(
  notificationMode: StreamNotificationMode = WORKSPACE_DEFAULT_STREAM_NOTIFICATION_MODE,
): NotificationLevel {
  return streamNotificationModeToLevel(notificationMode);
}

export function streamNotificationModeToLevel(
  notificationMode: StreamNotificationMode,
): NotificationLevel {
  if (notificationMode === "all_messages") return "subscribed";
  if (notificationMode === "muted") return "muted";
  return "default";
}

export function streamNotificationLevelToMode(level: NotificationLevel): StreamNotificationMode {
  if (level === "subscribed") return "all_messages";
  if (level === "muted") return "muted";
  return "mentions_only";
}

export function parseStreamNotificationMode(value: unknown): StreamNotificationMode | null {
  return parseWorkspaceStreamNotificationMode(value);
}

export function parseTopicNotificationMode(value: unknown): TopicNotificationMode | null {
  return parseWorkspaceTopicNotificationMode(value);
}

export function topicVisibilityLevelToMode(level: TopicVisibilityLevel): TopicNotificationMode {
  switch (level) {
    case "muted":
      return "mute";
    case "unmuted":
      return "unmute";
    case "followed":
      return "follow";
    case "inherit":
      return WORKSPACE_DEFAULT_TOPIC_NOTIFICATION_MODE;
    default: {
      const _exhaustive: never = level;
      return _exhaustive;
    }
  }
}

export function topicNotificationModeToVisibilityLevel(
  notificationMode: TopicNotificationMode = WORKSPACE_DEFAULT_TOPIC_NOTIFICATION_MODE,
): TopicVisibilityLevel {
  if (notificationMode === "follow") return "followed";
  if (notificationMode === "mute") return "muted";
  if (notificationMode === "unmute") return "unmuted";
  return "inherit";
}

export function topicNotificationLevelToMode(
  level: NotificationLevel,
  isStreamMuted: boolean,
): TopicNotificationMode {
  if (level === "muted") return "mute";
  if (level === "subscribed") return "follow";
  return isStreamMuted ? "unmute" : WORKSPACE_DEFAULT_TOPIC_NOTIFICATION_MODE;
}

/** Explicit topic notification mode only, not effective mute. */
export function deriveTopicVisibilityLevel(
  notificationMode: TopicNotificationMode = WORKSPACE_DEFAULT_TOPIC_NOTIFICATION_MODE,
): TopicVisibilityLevel {
  return topicNotificationModeToVisibilityLevel(notificationMode);
}

/** Effective notification behavior (inherit + muted stream → muted). */
export function deriveTopicNotificationLevel(
  notificationMode: TopicNotificationMode = WORKSPACE_DEFAULT_TOPIC_NOTIFICATION_MODE,
  isEffectivelyMuted: boolean,
): NotificationLevel {
  if (notificationMode === "follow") return "subscribed";
  if (notificationMode === "mute") return "muted";
  if (notificationMode === "unmute") return "default";
  if (isEffectivelyMuted) return "muted";
  return "default";
}
