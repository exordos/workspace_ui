/**
 * Zulip streams, subscriptions, topics, and stream admin API.
 */
import { guard } from "~/shared/lib/guards";
import { createLogger } from "~/shared/lib/logger";
import { normalizeGroupSettingValue } from "~/shared/lib/zulip-group-setting.lib";
import { getClient } from "./zulip-client.internal";
import {
  zulipPipelineDelete,
  zulipPipelineGet,
  zulipPipelinePost,
  zulipPipelinePatch,
} from "./zulip-pipeline.internal";
import type { MockStream, ZulipSubscription } from "./zulip.types";

const log = createLogger("zulip-streams");

export interface AddStreamMembersParams {
  streamName: string;
  userIds: number[];
  authorizationErrorsFatal?: boolean;
}

export interface AddStreamMembersResult {
  ok: boolean;
  addedUserIds: number[];
  alreadySubscribedUserIds: number[];
  unauthorizedStreams: string[];
  errorCode?: string;
}

export interface RemoveStreamMembersParams {
  streamName: string;
  userIds: number[];
  authorizationErrorsFatal?: boolean;
}

export interface RemoveStreamMembersResult {
  ok: boolean;
  removedUserIds: number[];
  alreadyUnsubscribedUserIds: number[];
  unauthorizedStreams: string[];
  errorCode?: string;
}

export interface DeleteTopicResult {
  ok: boolean;
  complete: boolean;
  attempts: number;
  errorCode?: string;
}

function parsePrincipalKeyToUserId(value: string): number | null {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return null;
  }
  return numeric;
}

function parseUserIdsFromPrincipalMap(value: unknown): number[] {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  const ids: number[] = [];
  for (const key of Object.keys(value)) {
    const userId = parsePrincipalKeyToUserId(key);
    if (userId != null) {
      ids.push(userId);
    }
  }
  return ids;
}

function parseUnauthorizedStreams(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((row): row is string => typeof row === "string")
      .map((row) => row.trim())
      .filter((row) => row.length > 0);
  }
  if (value != null && typeof value === "object" && !Array.isArray(value)) {
    return Object.keys(value)
      .filter((row) => row.trim().length > 0)
      .map((row) => row.trim());
  }
  return [];
}

function hasPrincipalMap(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

/** Fetches the user's subscriptions (GET /users/me/subscriptions) including is_muted per stream. */
export async function fetchSubscriptions(): Promise<ZulipSubscription[]> {
  const res = await zulipPipelineGet("/users/me/subscriptions");
  if (!res?.ok) {
    return [];
  }
  const data = res.data as {
    subscriptions?: {
      stream_id: number;
      name: string;
      is_muted?: boolean;
      in_home_view?: boolean;
      creator_id?: unknown;
      invite_only?: boolean;
      can_add_subscribers_group?: unknown;
      can_remove_subscribers_group?: unknown;
      can_administer_channel_group?: unknown;
    }[];
  };
  // Что делает: нормализует channel-level поля прав из ответа /users/me/subscriptions.
  return (data.subscriptions ?? []).map((subscription) => {
    const creatorId =
      typeof subscription.creator_id === "number" &&
      Number.isInteger(subscription.creator_id) &&
      subscription.creator_id > 0
        ? subscription.creator_id
        : undefined;
    const canAddSubscribersGroup = normalizeGroupSettingValue(
      subscription.can_add_subscribers_group,
    );
    const canRemoveSubscribersGroup = normalizeGroupSettingValue(
      subscription.can_remove_subscribers_group,
    );
    const canAdministerChannelGroup = normalizeGroupSettingValue(
      subscription.can_administer_channel_group,
    );
    return {
      stream_id: subscription.stream_id,
      name: subscription.name,
      is_muted: subscription.is_muted ?? !(subscription.in_home_view ?? true),
      ...(creatorId != null ? { creator_id: creatorId } : {}),
      ...(typeof subscription.invite_only === "boolean"
        ? { invite_only: subscription.invite_only }
        : {}),
      ...(canAddSubscribersGroup != null
        ? { can_add_subscribers_group: canAddSubscribersGroup }
        : {}),
      ...(canRemoveSubscribersGroup != null
        ? { can_remove_subscribers_group: canRemoveSubscribersGroup }
        : {}),
      ...(canAdministerChannelGroup != null
        ? { can_administer_channel_group: canAdministerChannelGroup }
        : {}),
    };
  });
}

export async function fetchStreams(): Promise<MockStream[]> {
  const client = await getClient();
  const data = await client.streams.retrieve();
  const list = data.streams ?? [];
  return list.map((s) => ({
    stream_id: s.stream_id,
    name: s.name,
    description: s.description ?? "",
    is_announcement_only: false,
  }));
}

/** Adds users to an existing stream (POST /users/me/subscriptions with principals). */
export async function addMembersToStream(
  params: AddStreamMembersParams,
): Promise<AddStreamMembersResult> {
  const streamName = guard.nonEmpty(params.streamName, "addMembersToStream.streamName").trim();
  const requestedUserIds = Array.from(
    new Set(params.userIds.map((userId) => guard.userId(userId, "addMembersToStream.userIds"))),
  ).sort((a, b) => a - b);

  if (requestedUserIds.length === 0) {
    return {
      ok: true,
      addedUserIds: [],
      alreadySubscribedUserIds: [],
      unauthorizedStreams: [],
    };
  }

  const requestBody: Record<string, string> = {
    subscriptions: JSON.stringify([{ name: streamName }]),
    principals: JSON.stringify(requestedUserIds),
  };

  if (params.authorizationErrorsFatal != null) {
    requestBody.authorization_errors_fatal = String(params.authorizationErrorsFatal);
  }

  try {
    const response = await zulipPipelinePost("/users/me/subscriptions", requestBody);
    if (!response.ok) {
      return {
        ok: false,
        addedUserIds: [],
        alreadySubscribedUserIds: [],
        unauthorizedStreams: [],
        errorCode: `http_${response.status}`,
      };
    }

    const payload = response.data as {
      result?: string;
      code?: string;
      msg?: string;
      subscribed?: unknown;
      already_subscribed?: unknown;
      unauthorized?: unknown;
    };
    if (payload.result === "error") {
      return {
        ok: false,
        addedUserIds: [],
        alreadySubscribedUserIds: [],
        unauthorizedStreams: parseUnauthorizedStreams(payload.unauthorized),
        errorCode: payload.code ?? "unknown_error",
      };
    }

    const alreadySubscribedUserIds = parseUserIdsFromPrincipalMap(payload.already_subscribed);
    const addedFromPayload = parseUserIdsFromPrincipalMap(payload.subscribed);
    // Что делает: если сервер прислал subscribed, доверяем только ему.
    const addedUserIds = hasPrincipalMap(payload.subscribed)
      ? addedFromPayload
      : requestedUserIds.filter((userId) => !alreadySubscribedUserIds.includes(userId));

    log.info("Stream members added", {
      streamNameLength: streamName.length,
      requestedCount: requestedUserIds.length,
      addedCount: addedUserIds.length,
      alreadySubscribedCount: alreadySubscribedUserIds.length,
    });

    return {
      ok: true,
      addedUserIds,
      alreadySubscribedUserIds,
      unauthorizedStreams: parseUnauthorizedStreams(payload.unauthorized),
    };
  } catch {
    return {
      ok: false,
      addedUserIds: [],
      alreadySubscribedUserIds: [],
      unauthorizedStreams: [],
      errorCode: "network_error",
    };
  }
}

/** Удаляет участников из существующего stream (DELETE /users/me/subscriptions с principals). */
export async function removeMembersFromStream(
  params: RemoveStreamMembersParams,
): Promise<RemoveStreamMembersResult> {
  const streamName = guard.nonEmpty(params.streamName, "removeMembersFromStream.streamName").trim();
  const requestedUserIds = Array.from(
    new Set(
      params.userIds.map((userId) => guard.userId(userId, "removeMembersFromStream.userIds")),
    ),
  ).sort((a, b) => a - b);

  if (requestedUserIds.length === 0) {
    return {
      ok: true,
      removedUserIds: [],
      alreadyUnsubscribedUserIds: [],
      unauthorizedStreams: [],
    };
  }

  const requestBody: Record<string, string> = {
    subscriptions: JSON.stringify([streamName]),
    principals: JSON.stringify(requestedUserIds),
  };

  if (params.authorizationErrorsFatal != null) {
    requestBody.authorization_errors_fatal = String(params.authorizationErrorsFatal);
  }

  try {
    const response = await zulipPipelineDelete("/users/me/subscriptions", requestBody);
    if (!response.ok) {
      return {
        ok: false,
        removedUserIds: [],
        alreadyUnsubscribedUserIds: [],
        unauthorizedStreams: [],
        errorCode: `http_${response.status}`,
      };
    }

    const payload = response.data as {
      result?: string;
      code?: string;
      msg?: string;
      removed?: unknown;
      unsubscribed?: unknown;
      already_unsubscribed?: unknown;
      not_removed?: unknown;
      unauthorized?: unknown;
    };
    if (payload.result === "error") {
      return {
        ok: false,
        removedUserIds: [],
        alreadyUnsubscribedUserIds: [],
        unauthorizedStreams: parseUnauthorizedStreams(payload.unauthorized),
        errorCode: payload.code ?? "unknown_error",
      };
    }

    const alreadyUnsubscribedUserIds = Array.from(
      new Set([
        ...parseUserIdsFromPrincipalMap(payload.already_unsubscribed),
        ...parseUserIdsFromPrincipalMap(payload.not_removed),
      ]),
    ).sort((a, b) => a - b);
    const removedFromPayload = Array.from(
      new Set([
        ...parseUserIdsFromPrincipalMap(payload.removed),
        ...parseUserIdsFromPrincipalMap(payload.unsubscribed),
      ]),
    ).sort((a, b) => a - b);
    // Что делает: если сервер явно прислал removed/unsubscribed, доверяем payload;
    // иначе считаем removed как requested минус already-unsubscribed.
    const hasRemovedMap = hasPrincipalMap(payload.removed) || hasPrincipalMap(payload.unsubscribed);
    const removedUserIds = hasRemovedMap
      ? removedFromPayload
      : requestedUserIds.filter((userId) => !alreadyUnsubscribedUserIds.includes(userId));

    log.info("Stream members removed", {
      streamNameLength: streamName.length,
      requestedCount: requestedUserIds.length,
      removedCount: removedUserIds.length,
      alreadyUnsubscribedCount: alreadyUnsubscribedUserIds.length,
    });

    return {
      ok: true,
      removedUserIds,
      alreadyUnsubscribedUserIds,
      unauthorizedStreams: parseUnauthorizedStreams(payload.unauthorized),
    };
  } catch {
    return {
      ok: false,
      removedUserIds: [],
      alreadyUnsubscribedUserIds: [],
      unauthorizedStreams: [],
      errorCode: "network_error",
    };
  }
}

/** Fetches subscriber IDs for a stream (GET /streams/{stream_id}/members). */
export async function fetchStreamMembers(streamId: number): Promise<number[]> {
  guard.streamId(streamId, "fetchStreamMembers");
  const res = await zulipPipelineGet(`/streams/${streamId}/members`);
  if (!res?.ok) {
    return [];
  }
  const data = res.data as { result?: string; subscribers?: number[] };
  if (data.result === "error") return [];
  return data.subscribers ?? [];
}

export async function fetchTopics(stream: string): Promise<string[]> {
  const streamName = guard.nonEmpty(stream, "fetchTopics.stream");
  const client = await getClient();
  const streamsData = await client.streams.retrieve();
  const streamObj = (streamsData.streams ?? []).find((s) => s.name === streamName);
  if (!streamObj) return [];
  const data = await client.streams.topics.retrieve({ stream_id: streamObj.stream_id });
  return (data.topics ?? []).map((topic) => topic.name);
}

/** Updates stream metadata (PATCH /api/v1/streams/{stream_id}). */
export async function updateStream(
  streamId: number,
  params: { name?: string; description?: string },
): Promise<boolean> {
  guard.streamId(streamId, "updateStream.streamId");
  const body: Record<string, string> = {};
  const trimmedName = params.name?.trim();
  if (trimmedName != null && trimmedName.length > 0) {
    body.new_name = trimmedName;
  }
  if (params.description != null) {
    body.description = params.description.trim();
  }
  if (Object.keys(body).length === 0) {
    return true;
  }

  try {
    const res = await zulipPipelinePatch(`streams/${streamId}`, body);
    if (!res.ok) return false;
    const data = res.data as { result?: string };
    return data.result !== "error";
  } catch {
    return false;
  }
}

/** Deletes a stream (DELETE /api/v1/streams/{stream_id}). */
export async function deleteStream(streamId: number): Promise<boolean> {
  guard.streamId(streamId, "deleteStream.streamId");
  try {
    const res = await zulipPipelineDelete(`streams/${streamId}`);
    if (!res.ok) return false;
    const data = res.data as { result?: string };
    return data.result !== "error";
  } catch {
    return false;
  }
}

/** Deletes all messages in a topic (POST /api/v1/streams/{stream_id}/delete_topic). */
export async function deleteTopic(
  streamId: number,
  topicName: string,
  maxAttempts = 5,
): Promise<DeleteTopicResult> {
  guard.streamId(streamId, "deleteTopic.streamId");
  const normalizedTopicName = topicName.trim();
  const attemptsLimit = Math.max(1, Math.floor(maxAttempts));

  for (let attempt = 1; attempt <= attemptsLimit; attempt += 1) {
    try {
      const res = await zulipPipelinePost(`/streams/${streamId}/delete_topic`, {
        topic_name: normalizedTopicName,
      });
      if (!res.ok) {
        return {
          ok: false,
          complete: false,
          attempts: attempt,
          errorCode: `http_${res.status}`,
        };
      }

      const data = res.data as { result?: string; complete?: unknown; code?: string };
      if (data.result === "error") {
        return {
          ok: false,
          complete: false,
          attempts: attempt,
          errorCode: data.code ?? "unknown_error",
        };
      }

      const complete = data.complete !== false;
      if (complete) {
        return {
          ok: true,
          complete: true,
          attempts: attempt,
        };
      }
    } catch {
      return {
        ok: false,
        complete: false,
        attempts: attempt,
        errorCode: "network_error",
      };
    }
  }

  return {
    ok: false,
    complete: false,
    attempts: attemptsLimit,
    errorCode: "incomplete_after_retries",
  };
}
