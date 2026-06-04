/**
 * Mute/unmute API — calls Zulip endpoints for stream and topic muting.
 *
 * Stream mute: POST /users/me/subscriptions/properties
 * Topic mute: POST /user_topics
 */

import { zulipApi } from "~/shared/api/client";
import { guard } from "~/shared/lib/guards";
import { createLogger } from "~/shared/lib/logger";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import { useMuteStore } from "./mute-chat.model";
import { VISIBILITY_POLICY, type VisibilityPolicy } from "./mute-chat.types";
import type { NotificationLevel, TopicVisibilityLevel } from "./notification-level.lib";

const log = createLogger("mute:api");

interface SubscriptionPropertyRow {
  stream_id: number;
  property: string;
  value: boolean;
}

async function postSubscriptionProperties(rows: SubscriptionPropertyRow[]): Promise<boolean> {
  if (rows.length === 0) return true;
  try {
    const res = await zulipApi.post("/users/me/subscriptions/properties", {
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
export async function setStreamMuted(streamId: number, muted: boolean): Promise<boolean> {
  guard.streamId(streamId, "setStreamMuted");
  const ok = await postSubscriptionProperties([
    { stream_id: streamId, property: "is_muted", value: muted },
  ]);
  if (ok) {
    log.info(`Stream ${muted ? "muted" : "unmuted"}`, { streamId });
  }
  return ok;
}

export async function setStreamDesktopNotifications(
  streamId: number,
  enabled: boolean,
): Promise<boolean> {
  guard.streamId(streamId, "setStreamDesktopNotifications");
  const ok = await postSubscriptionProperties([
    { stream_id: streamId, property: "desktop_notifications", value: enabled },
  ]);
  if (ok) {
    log.info("Stream desktop notifications set", { streamId, enabled });
  }
  return ok;
}

export async function setStreamAudibleNotifications(
  streamId: number,
  enabled: boolean,
): Promise<boolean> {
  guard.streamId(streamId, "setStreamAudibleNotifications");
  const ok = await postSubscriptionProperties([
    { stream_id: streamId, property: "audible_notifications", value: enabled },
  ]);
  if (ok) {
    log.info("Stream audible notifications set", { streamId, enabled });
  }
  return ok;
}

/** Applies Zulip channel notification level in one request (mute + desktop). */
export async function setStreamNotificationLevel(
  streamId: number,
  level: NotificationLevel,
): Promise<boolean> {
  guard.streamId(streamId, "setStreamNotificationLevel");

  const rows: SubscriptionPropertyRow[] = [];
  if (level === "muted") {
    rows.push({ stream_id: streamId, property: "is_muted", value: true });
  } else {
    rows.push({ stream_id: streamId, property: "is_muted", value: false });
    rows.push({
      stream_id: streamId,
      property: "desktop_notifications",
      value: level === "subscribed",
    });
    rows.push({
      stream_id: streamId,
      property: "audible_notifications",
      value: level === "subscribed",
    });
  }

  const ok = await postSubscriptionProperties(rows);
  if (ok) {
    log.info("Stream notification level set", { streamId, level });
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
  streamId: number,
  topic: string,
  policy: VisibilityPolicy,
): Promise<boolean> {
  guard.streamId(streamId, "setTopicVisibility");
  const normalizedTopic = normalizeTopicForIdentity(topic);

  try {
    const res = await zulipApi.post("/user_topics", {
      stream_id: String(streamId),
      topic: normalizedTopic,
      visibility_policy: String(policy),
    });

    if (res.ok) {
      log.info("Topic visibility set", { streamId, topic: normalizedTopic, policy });
      return true;
    }

    log.warn("Topic visibility failed", { streamId, topic: normalizedTopic, status: res.status });
    return false;
  } catch (err) {
    log.error("Topic visibility error", { streamId, topic: normalizedTopic, error: String(err) });
    return false;
  }
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

/** Sets Zulip user_topics.visibility_policy (0–3). */
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
