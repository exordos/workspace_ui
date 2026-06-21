/**
 * Mute/unmute API — calls Workspace endpoints for stream and topic muting.
 *
 * Stream mute: POST /users/me/subscriptions/properties
 * Topic mute: POST /user_topics
 */

import { messengerApi } from "~/shared/api/client";
import { guard } from "~/shared/lib/guards";
import { createLogger } from "~/shared/lib/logger";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import { useMuteStore } from "./mute-chat.model";
import { VISIBILITY_POLICY, type VisibilityPolicy } from "./mute-chat.types";
import type { NotificationLevel, TopicVisibilityLevel } from "./notification-level.lib";

const log = createLogger("mute:api");

interface SubscriptionPropertyRow {
  stream_uuid: string;
  property: string;
  value: boolean;
}

async function postSubscriptionProperties(rows: SubscriptionPropertyRow[]): Promise<boolean> {
  if (rows.length === 0) return true;
  try {
    const res = await messengerApi.post("/users/me/subscriptions/properties", {
      subscription_data: JSON.stringify(rows),
    });
    if (res.ok) return true;
    log.warn("Subscription properties failed", { status: res.status, count: rows.length });
    return false;
  } catch (err) {
    log.error("Subscription properties error", { error: String(err), count: rows.length });
    return false;
  }
}

/**
 * Mute or unmute a stream (channel).
 * Sets the `is_muted` property on the user's subscription.
 */
export async function setStreamMuted(streamId: string, muted: boolean): Promise<boolean> {
  const streamUuid = guard.streamUuid(streamId, "setStreamMuted");
  const ok = await postSubscriptionProperties([
    { stream_uuid: streamUuid, property: "is_muted", value: muted },
  ]);
  if (ok) {
    log.info(`Stream ${muted ? "muted" : "unmuted"}`, { streamId: streamUuid });
  }
  return ok;
}

export async function setStreamDesktopNotifications(
  streamId: string,
  enabled: boolean,
): Promise<boolean> {
  const streamUuid = guard.streamUuid(streamId, "setStreamDesktopNotifications");
  const ok = await postSubscriptionProperties([
    { stream_uuid: streamUuid, property: "desktop_notifications", value: enabled },
  ]);
  if (ok) {
    log.info("Stream desktop notifications set", { streamId: streamUuid, enabled });
  }
  return ok;
}

export async function setStreamAudibleNotifications(
  streamId: string,
  enabled: boolean,
): Promise<boolean> {
  const streamUuid = guard.streamUuid(streamId, "setStreamAudibleNotifications");
  const ok = await postSubscriptionProperties([
    { stream_uuid: streamUuid, property: "audible_notifications", value: enabled },
  ]);
  if (ok) {
    log.info("Stream audible notifications set", { streamId: streamUuid, enabled });
  }
  return ok;
}

/** Applies Workspace channel notification level in one request (mute + desktop). */
export async function setStreamNotificationLevel(
  streamId: string,
  level: NotificationLevel,
): Promise<boolean> {
  const streamUuid = guard.streamUuid(streamId, "setStreamNotificationLevel");

  const rows: SubscriptionPropertyRow[] = [];
  if (level === "muted") {
    rows.push({ stream_uuid: streamUuid, property: "is_muted", value: true });
  } else {
    rows.push({ stream_uuid: streamUuid, property: "is_muted", value: false });
    rows.push({
      stream_uuid: streamUuid,
      property: "desktop_notifications",
      value: level === "subscribed",
    });
    rows.push({
      stream_uuid: streamUuid,
      property: "audible_notifications",
      value: level === "subscribed",
    });
  }

  const ok = await postSubscriptionProperties(rows);
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
export async function setTopicVisibility(
  streamId: string,
  topic: string,
  policy: VisibilityPolicy,
): Promise<boolean> {
  const streamUuid = guard.streamUuid(streamId, "setTopicVisibility");
  const normalizedTopic = normalizeTopicForIdentity(topic);

  try {
    const res = await messengerApi.post("/user_topics", {
      stream_uuid: streamUuid,
      topic: normalizedTopic,
      visibility_policy: String(policy),
    });

    if (res.ok) {
      log.info("Topic visibility set", { streamId: streamUuid, topic: normalizedTopic, policy });
      return true;
    }

    log.warn("Topic visibility failed", { streamId: streamUuid, topic: normalizedTopic, status: res.status });
    return false;
  } catch (err) {
    log.error("Topic visibility error", { streamId: streamUuid, topic: normalizedTopic, error: String(err) });
    return false;
  }
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

/** Sets Workspace user_topics.visibility_policy (0–3). */
export async function setTopicVisibilityLevel(
  streamId: string,
  topic: string,
  level: TopicVisibilityLevel,
): Promise<boolean> {
  guard.streamUuid(streamId, "setTopicVisibilityLevel");
  return setTopicVisibility(streamId, topic, topicVisibilityLevelToPolicy(level));
}

/**
 * @deprecated Use setTopicVisibilityLevel — maps legacy 3-level UI to visibility_policy.
 */
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
