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
import { VISIBILITY_POLICY, type VisibilityPolicy } from "./mute-chat.types";

const log = createLogger("mute:api");

/**
 * Mute or unmute a stream (channel).
 * Sets the `is_muted` property on the user's subscription.
 */
export async function setStreamMuted(streamId: number, muted: boolean): Promise<boolean> {
  guard.streamId(streamId, "setStreamMuted");

  try {
    const res = await zulipApi.post("/users/me/subscriptions/properties", {
      subscription_data: JSON.stringify([
        { stream_id: streamId, property: "is_muted", value: muted },
      ]),
    });

    if (res.ok) {
      log.info(`Stream ${muted ? "muted" : "unmuted"}`, { streamId });
      return true;
    }

    log.warn("Stream mute failed", { streamId, status: res.status });
    return false;
  } catch (err) {
    log.error("Stream mute error", { streamId, error: String(err) });
    return false;
  }
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

export async function muteTopic(streamId: number, topic: string): Promise<boolean> {
  return setTopicVisibility(streamId, topic, VISIBILITY_POLICY.MUTED);
}

export async function unmuteTopic(streamId: number, topic: string): Promise<boolean> {
  return setTopicVisibility(streamId, topic, VISIBILITY_POLICY.INHERIT);
}

export async function unmuteTopicInMutedStream(streamId: number, topic: string): Promise<boolean> {
  return setTopicVisibility(streamId, topic, VISIBILITY_POLICY.UNMUTED);
}
