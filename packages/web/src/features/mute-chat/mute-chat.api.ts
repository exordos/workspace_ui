/**
 * Mute/unmute API facade.
 *
 * Stream and topic notification writes use Workspace notification actions.
 */

import { getMessengerWorkspaceApiBaseForCurrentInstance, messengerApi } from "~/shared/api/client";
import { guard } from "~/shared/lib/guards";
import { createLogger } from "~/shared/lib/logger";
import { useMuteStore } from "./mute-chat.model";
import {
  streamNotificationLevelToMode,
  topicNotificationLevelToMode,
  topicVisibilityLevelToMode,
  type NotificationLevel,
  type StreamNotificationMode,
  type TopicNotificationMode,
  type TopicVisibilityLevel,
} from "./notification-level.lib";

const log = createLogger("mute:api");

async function postNotificationModeAction(
  url: string,
  payload: { notification_mode: StreamNotificationMode | TopicNotificationMode },
  logContext: Record<string, unknown>,
): Promise<boolean> {
  try {
    const response = await messengerApi.postJsonWithBase(
      getMessengerWorkspaceApiBaseForCurrentInstance(),
      url,
      payload,
    );
    if (!response.ok) {
      log.warn("Notification action failed", { ...logContext, status: response.status });
      return false;
    }
    const data = response.data as { result?: string } | undefined;
    if (data?.result === "error") {
      log.warn("Notification action returned error", logContext);
      return false;
    }
    return true;
  } catch (error) {
    log.warn("Notification action request failed", { ...logContext, error: String(error) });
    return false;
  }
}

async function postStreamNotificationMode(
  streamUuid: string,
  notificationMode: StreamNotificationMode,
): Promise<boolean> {
  return postNotificationModeAction(
    `/streams/${streamUuid}/actions/notifications/invoke`,
    { notification_mode: notificationMode },
    { target: "stream", streamId: streamUuid, notificationMode },
  );
}

async function postTopicNotificationMode(
  topicUuid: string,
  notificationMode: TopicNotificationMode,
): Promise<boolean> {
  return postNotificationModeAction(
    `/stream_topics/${topicUuid}/actions/notifications/invoke`,
    { notification_mode: notificationMode },
    { target: "topic", topicId: topicUuid, notificationMode },
  );
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

/** Applies Workspace topic notification mode by topic UUID. */
export async function setTopicNotificationMode(
  streamId: string,
  topic: string,
  notificationMode: TopicNotificationMode,
): Promise<boolean> {
  guard.streamUuid(streamId, "setTopicNotificationMode.streamId");
  const topicUuid = guard.streamUuid(topic, "setTopicNotificationMode.topicUuid");
  const ok = await postTopicNotificationMode(topicUuid, notificationMode);
  if (ok) {
    log.info("Topic notification mode set", { streamId, topicId: topicUuid, notificationMode });
  }
  return ok;
}

export async function muteStream(streamId: string): Promise<boolean> {
  return setStreamMuted(streamId, true);
}

export async function unmuteStream(streamId: string): Promise<boolean> {
  return setStreamMuted(streamId, false);
}

/** Validates and applies the topic notification mode exposed by the 4-level topic UI. */
export async function setTopicVisibilityLevel(
  streamId: string,
  topic: string,
  level: TopicVisibilityLevel,
): Promise<boolean> {
  return setTopicNotificationMode(streamId, topic, topicVisibilityLevelToMode(level));
}

/** Maps the 3-level UI to Workspace topic notification modes. */
export async function setTopicNotificationLevel(
  streamId: string,
  topic: string,
  level: NotificationLevel,
): Promise<boolean> {
  guard.streamUuid(streamId, "setTopicNotificationLevel");
  const mode = topicNotificationLevelToMode(level, useMuteStore.getState().isStreamMuted(streamId));
  return setTopicNotificationMode(streamId, topic, mode);
}

export async function muteTopic(streamId: string, topic: string): Promise<boolean> {
  return setTopicNotificationMode(streamId, topic, "mute");
}

export async function unmuteTopic(streamId: string, topic: string): Promise<boolean> {
  return setTopicNotificationMode(streamId, topic, "default");
}

export async function unmuteTopicInMutedStream(streamId: string, topic: string): Promise<boolean> {
  return setTopicNotificationMode(streamId, topic, "unmute");
}
