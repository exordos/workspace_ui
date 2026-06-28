/**
 * Mute/unmute type definitions.
 *
 * Workspace supports muting at two levels:
 * 1. Channel (stream) level
 * 2. Topic level via notification mode values
 */
import type { StreamNotificationMode, TopicNotificationMode } from "./notification-level.lib";

export type MuteTarget =
  | { type: "stream"; streamId: string }
  | { type: "topic"; streamId: string; topic: string };

export interface MuteState {
  /** Stream UUIDs that the user has muted. */
  mutedStreamIds: Set<string>;
  /** Stream UUID → Workspace stream notification mode. */
  streamNotificationModes: Map<string, StreamNotificationMode>;
  /** "streamUuid:topicUuid" → Workspace topic notification mode. */
  topicNotificationModes: Map<string, TopicNotificationMode>;
}
