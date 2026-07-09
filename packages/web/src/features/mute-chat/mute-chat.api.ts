/**
 * Legacy numeric mute actions.
 *
 * Workspace-native notification writes live outside this slice. These functions are still used by
 * numeric legacy UI, where writes are intentionally unsupported so optimistic callers roll back.
 */

import { guard } from "~/shared/lib/guards";
import { createLogger } from "~/shared/lib/logger";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import { useMuteStore } from "./mute-chat.model";
import { VISIBILITY_POLICY, type VisibilityPolicy } from "./mute-chat.types";
import type { NotificationLevel, TopicVisibilityLevel } from "./notification-level.lib";

const log = createLogger("mute:api");

function unsupported(action: string, details: Record<string, unknown>): false {
  log.warn("Legacy numeric mute action is unsupported", { action, ...details });
  return false;
}

/**
 * Mute or unmute a legacy numeric stream.
 */
export function setStreamMuted(streamId: number, muted: boolean): Promise<boolean> {
  guard.streamId(streamId, "setStreamMuted");
  return Promise.resolve(unsupported("setStreamMuted", { streamId, muted }));
}

export function setStreamDesktopNotifications(
  streamId: number,
  enabled: boolean,
): Promise<boolean> {
  guard.streamId(streamId, "setStreamDesktopNotifications");
  return Promise.resolve(unsupported("setStreamDesktopNotifications", { streamId, enabled }));
}

export function setStreamAudibleNotifications(
  streamId: number,
  enabled: boolean,
): Promise<boolean> {
  guard.streamId(streamId, "setStreamAudibleNotifications");
  return Promise.resolve(unsupported("setStreamAudibleNotifications", { streamId, enabled }));
}

/** Applies a legacy numeric channel notification level. */
export function setStreamNotificationLevel(
  streamId: number,
  level: NotificationLevel,
): Promise<boolean> {
  guard.streamId(streamId, "setStreamNotificationLevel");
  return Promise.resolve(unsupported("setStreamNotificationLevel", { streamId, level }));
}

/**
 * Set legacy numeric topic visibility policy.
 *
 * Policies:
 *   0 = inherit (remove explicit override)
 *   1 = muted
 *   2 = unmuted (overrides stream-level mute)
 *   3 = followed
 */
export function setTopicVisibility(
  streamId: number,
  topic: string,
  policy: VisibilityPolicy,
): Promise<boolean> {
  guard.streamId(streamId, "setTopicVisibility");
  const normalizedTopic = normalizeTopicForIdentity(topic);
  return Promise.resolve(
    unsupported("setTopicVisibility", { streamId, topic: normalizedTopic, policy }),
  );
}

export async function muteStream(streamId: number): Promise<boolean> {
  return setStreamMuted(streamId, true);
}

export async function unmuteStream(streamId: number): Promise<boolean> {
  return setStreamMuted(streamId, false);
}

function topicVisibilityLevelToPolicy(level: TopicVisibilityLevel): VisibilityPolicy {
  switch (level) {
    case "muted":
      return VISIBILITY_POLICY.MUTED;
    case "unmuted":
      return VISIBILITY_POLICY.UNMUTED;
    case "followed":
      return VISIBILITY_POLICY.FOLLOWED;
    case "inherit":
      return VISIBILITY_POLICY.INHERIT;
    default: {
      const _exhaustive: never = level;
      return _exhaustive;
    }
  }
}

/** Sets a legacy numeric topic visibility level. */
export async function setTopicVisibilityLevel(
  streamId: number,
  topic: string,
  level: TopicVisibilityLevel,
): Promise<boolean> {
  guard.streamId(streamId, "setTopicVisibilityLevel");
  return setTopicVisibility(streamId, topic, topicVisibilityLevelToPolicy(level));
}

/**
 * @deprecated Use setTopicVisibilityLevel — maps legacy 3-level UI to visibility_policy.
 */
export async function setTopicNotificationLevel(
  streamId: number,
  topic: string,
  level: NotificationLevel,
): Promise<boolean> {
  guard.streamId(streamId, "setTopicNotificationLevel");
  if (level === "muted") {
    return setTopicVisibilityLevel(streamId, topic, "muted");
  }
  if (level === "subscribed") {
    return setTopicVisibilityLevel(streamId, topic, "followed");
  }
  if (useMuteStore.getState().isStreamMuted(streamId)) {
    return setTopicVisibilityLevel(streamId, topic, "unmuted");
  }
  return setTopicVisibilityLevel(streamId, topic, "inherit");
}

export async function muteTopic(streamId: number, topic: string): Promise<boolean> {
  return setTopicVisibility(streamId, topic, VISIBILITY_POLICY.MUTED);
}

export async function unmuteTopic(streamId: number, topic: string): Promise<boolean> {
  return setTopicVisibility(streamId, topic, VISIBILITY_POLICY.INHERIT);
}

export async function unmuteTopicInMutedStream(streamId: number, topic: string): Promise<boolean> {
  return setTopicVisibility(streamId, topic, VISIBILITY_POLICY.UNMUTED);
}
