/**
 * Workspace notification levels for streams and topics.
 *
 * Streams use Workspace `notification_mode` values from the gateway backend.
 * Topics use TopicVisibilityLevel (4 Workspace visibility_policy values).
 */

import type { WorkspaceStreamNotificationMode } from "~/shared/api/messenger.types";
import {
  parseWorkspaceStreamNotificationMode,
  WORKSPACE_DEFAULT_STREAM_NOTIFICATION_MODE,
} from "~/shared/lib/stream-notification-resolve.lib";

export type NotificationLevel = "default" | "muted" | "subscribed";
export type StreamNotificationMode = WorkspaceStreamNotificationMode;

/** Topic visibility policy exposed by the UI. */
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

/** Explicit topic override only (matches Workspace visibility_policy, not effective mute). */
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
