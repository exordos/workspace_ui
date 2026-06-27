/**
 * Mute/unmute API facade.
 *
 * Stream notification writes use the Workspace stream notifications action.
 * Topic visibility writes are not exposed by the Workspace gateway backend yet.
 */

import { getMessengerWorkspaceApiBaseForCurrentInstance, messengerApi } from "~/shared/api/client";
import { guard } from "~/shared/lib/guards";
import { createLogger } from "~/shared/lib/logger";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import { useMuteStore } from "./mute-chat.model";
import { VISIBILITY_POLICY, type VisibilityPolicy } from "./mute-chat.types";
import {
  streamNotificationLevelToMode,
  type NotificationLevel,
  type StreamNotificationMode,
  type TopicVisibilityLevel,
} from "./notification-level.lib";

const log = createLogger("mute:api");

async function postStreamNotificationMode(
  streamUuid: string,
  notificationMode: StreamNotificationMode,
): Promise<boolean> {
  try {
    const response = await messengerApi.postJsonWithBase(
      getMessengerWorkspaceApiBaseForCurrentInstance(),
      `/streams/${streamUuid}/actions/notifications/invoke`,
      { notification_mode: notificationMode },
    );
    if (!response.ok) {
      log.warn("Stream notification action failed", {
        streamId: streamUuid,
        notificationMode,
        status: response.status,
      });
      return false;
    }
    const data = response.data as { result?: string } | undefined;
    if (data?.result === "error") {
      log.warn("Stream notification action returned error", { streamId: streamUuid });
      return false;
    }
    return true;
  } catch (error) {
    log.warn("Stream notification action request failed", {
      streamId: streamUuid,
      notificationMode,
      error: String(error),
    });
    return false;
  }
}

/**
 * Mute or unmute a stream.
 * Uses Workspace stream `notification_mode`.
 */
export async function setStreamMuted(streamId: string, muted: boolean): Promise<boolean> {
  const streamUuid = guard.streamUuid(streamId, "setStreamMuted");
  const ok = await postStreamNotificationMode(streamUuid, muted ? "muted" : "mentions_only");
  if (ok) {
    log.info(`Stream ${muted ? "muted" : "unmuted"}`, { streamId: streamUuid });
  }
  return ok;
}

/** Applies Workspace stream notification mode in one request. */
export async function setStreamNotificationLevel(
  streamId: string,
  level: NotificationLevel,
): Promise<boolean> {
  const streamUuid = guard.streamUuid(streamId, "setStreamNotificationLevel");
  const ok = await postStreamNotificationMode(streamUuid, streamNotificationLevelToMode(level));
  if (ok) {
    log.info("Stream notification level set", { streamId: streamUuid, level });
  }
  return ok;
}

/**
 * Set topic visibility policy (mute/unmute/follow).
 *
 * Policies:
 *   0 = inherit (remove explicit override)
 *   1 = muted
 *   2 = unmuted (overrides stream-level mute)
 *   3 = followed
 */
export function setTopicVisibility(
  streamId: string,
  topic: string,
  policy: VisibilityPolicy,
): Promise<boolean> {
  const streamUuid = guard.streamUuid(streamId, "setTopicVisibility");
  const normalizedTopic = normalizeTopicForIdentity(topic);

  log.warn("Topic visibility is unsupported by the current backend", {
    streamId: streamUuid,
    topic: normalizedTopic,
    policy,
  });
  return Promise.resolve(false);
}

export async function muteStream(streamId: string): Promise<boolean> {
  return setStreamMuted(streamId, true);
}

export async function unmuteStream(streamId: string): Promise<boolean> {
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

/** Validates topic visibility policy values (0-3). */
export async function setTopicVisibilityLevel(
  streamId: string,
  topic: string,
  level: TopicVisibilityLevel,
): Promise<boolean> {
  guard.streamUuid(streamId, "setTopicVisibilityLevel");
  return setTopicVisibility(streamId, topic, topicVisibilityLevelToPolicy(level));
}

/** Maps the 3-level UI to local topic visibility semantics. */
export async function setTopicNotificationLevel(
  streamId: string,
  topic: string,
  level: NotificationLevel,
): Promise<boolean> {
  guard.streamUuid(streamId, "setTopicNotificationLevel");
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

export async function muteTopic(streamId: string, topic: string): Promise<boolean> {
  return setTopicVisibility(streamId, topic, VISIBILITY_POLICY.MUTED);
}

export async function unmuteTopic(streamId: string, topic: string): Promise<boolean> {
  return setTopicVisibility(streamId, topic, VISIBILITY_POLICY.INHERIT);
}

export async function unmuteTopicInMutedStream(streamId: string, topic: string): Promise<boolean> {
  return setTopicVisibility(streamId, topic, VISIBILITY_POLICY.UNMUTED);
}
