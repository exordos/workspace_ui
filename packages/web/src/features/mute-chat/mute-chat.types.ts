/**
 * Mute/unmute type definitions.
 *
 * Workspace supports muting at two levels:
 * 1. Channel (stream) level
 * 2. Topic level via visibility policy values
 */

export type MuteTarget =
  | { type: "stream"; streamId: string }
  | { type: "topic"; streamId: string; topic: string };

export type VisibilityPolicy = 0 | 1 | 2 | 3;

/**
 * Workspace visibility policy values:
 * 0 = inherit (not explicitly muted or unmuted)
 * 1 = muted
 * 2 = unmuted (overrides channel-level mute)
 * 3 = followed (shows in inbox even if channel is muted)
 */
export const VISIBILITY_POLICY = {
  INHERIT: 0 as VisibilityPolicy,
  MUTED: 1 as VisibilityPolicy,
  UNMUTED: 2 as VisibilityPolicy,
  FOLLOWED: 3 as VisibilityPolicy,
} as const;

export interface MuteState {
  /** Stream UUIDs that the user has muted. */
  mutedStreamIds: Set<string>;
  /** Topic keys ("streamUuid:topicName") that the user has explicitly muted. */
  mutedTopicKeys: Set<string>;
  /** Topic keys that are explicitly unmuted (override stream-level mute). */
  unmutedTopicKeys: Set<string>;
  /** Topic keys that are explicitly followed. */
  followedTopicKeys: Set<string>;
}
