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
import type { MockStream, ZulipGroupSettingValue, ZulipSubscription } from "./zulip.types";

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

export type ResolveStreamIdByNameResult =
  | { ok: true; streamId: number }
  | { ok: false; kind: "not_found" | "forbidden" | "transient" };

/** PATCH /streams/{id} response fields relevant to unarchive and server compatibility. */
interface StreamPatchResponsePayload {
  result?: string;
  msg?: string;
  code?: string;
  ignored_parameters_unsupported?: unknown;
}

export type StreamUnarchiveErrorKind = "unsupported" | "transient" | "forbidden" | "invalid";

export type UnarchiveStreamResult =
  | { ok: true }
  | {
      ok: false;
      kind: StreamUnarchiveErrorKind;
      message: string;
      status: number;
      code?: string;
    };

function mapStreamPatchErrorKind(status: number): StreamUnarchiveErrorKind {
  if (status === 403) return "forbidden";
  if (status === 400) return "invalid";
  if (status === 404 || status === 405) return "unsupported";
  return "transient";
}

function readStreamPatchErrorMessage(
  data: StreamPatchResponsePayload,
  status: number,
  fallback: string,
): string {
  if (typeof data.msg === "string" && data.msg.trim().length > 0) {
    return data.msg;
  }
  if (typeof data.code === "string" && data.code.trim().length > 0) {
    return data.code;
  }
  if (status > 0) {
    return `${fallback} (HTTP ${status})`;
  }
  return fallback;
}

function includesUnsupportedIsArchivedParameter(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.some((entry) => entry === "is_archived");
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
export async function fetchSubscriptions(signal?: AbortSignal): Promise<ZulipSubscription[]> {
  const res = await zulipPipelineGet("/users/me/subscriptions", undefined, signal);
  if (!res?.ok) {
    return [];
  }
  const data = res.data as {
    subscriptions?: {
      stream_id: number;
      name: string;
      is_muted?: boolean;
      desktop_notifications?: boolean | null;
      audible_notifications?: boolean | null;
      is_archived?: boolean;
      in_home_view?: boolean;
      creator_id?: unknown;
      invite_only?: boolean;
      can_add_subscribers_group?: unknown;
      can_remove_subscribers_group?: unknown;
      can_administer_channel_group?: unknown;
      can_resolve_topics_group?: unknown;
      can_move_messages_out_of_channel_group?: unknown;
    }[];
  };
  // Normalizes channel-level permission fields from /users/me/subscriptions.
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
    const canResolveTopicsGroup = normalizeGroupSettingValue(subscription.can_resolve_topics_group);
    const canMoveMessagesOutOfChannelGroup = normalizeGroupSettingValue(
      subscription.can_move_messages_out_of_channel_group,
    );
    return {
      stream_id: subscription.stream_id,
      name: subscription.name,
      is_muted: subscription.is_muted ?? !(subscription.in_home_view ?? true),
      ...(subscription.desktop_notifications === true ||
      subscription.desktop_notifications === false
        ? { desktop_notifications: subscription.desktop_notifications }
        : {}),
      ...(subscription.audible_notifications === true ||
      subscription.audible_notifications === false
        ? { audible_notifications: subscription.audible_notifications }
        : {}),
      ...(typeof subscription.is_archived === "boolean"
        ? { is_archived: subscription.is_archived }
        : {}),
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
      ...(canResolveTopicsGroup != null ? { can_resolve_topics_group: canResolveTopicsGroup } : {}),
      ...(canMoveMessagesOutOfChannelGroup != null
        ? { can_move_messages_out_of_channel_group: canMoveMessagesOutOfChannelGroup }
        : {}),
    };
  });
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readOptionalCount(value: unknown): number | null | undefined {
  if (value == null) {
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return Math.floor(value);
}

function readOptionalPolicy(value: unknown): number | null | undefined {
  if (value == null) {
    return null;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return undefined;
  }
  return value;
}

function readOptionalUnixTimestamp(value: unknown): number | null | undefined {
  if (value == null) {
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Math.floor(value);
}

function readOptionalGroupSetting(value: unknown): ZulipGroupSettingValue | undefined {
  return normalizeGroupSettingValue(value);
}

interface RawStreamPayload {
  stream_id: number;
  name: string;
  description?: string;
  invite_only?: unknown;
  is_announcement_only?: unknown;
  history_public_to_subscribers?: unknown;
  is_web_public?: unknown;
  subscriber_count?: unknown;
  stream_weekly_traffic?: unknown;
  stream_post_policy?: unknown;
  creator_id?: unknown;
  date_created?: unknown;
  folder_id?: unknown;
  is_default?: unknown;
  is_recently_active?: unknown;
  message_retention_days?: unknown;
  can_subscribe_group?: unknown;
  can_add_subscribers_group?: unknown;
  can_remove_subscribers_group?: unknown;
  can_administer_channel_group?: unknown;
  can_resolve_topics_group?: unknown;
  can_move_messages_out_of_channel_group?: unknown;
}

function readOptionalCreatorId(value: unknown): number | null | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (value === null) {
    return null;
  }
  return undefined;
}

function parseRawStream(raw: unknown): MockStream {
  const stream = raw as RawStreamPayload;
  const inviteOnly = readOptionalBoolean(stream.invite_only);
  const historyPublic = readOptionalBoolean(stream.history_public_to_subscribers);
  const isWebPublic = readOptionalBoolean(stream.is_web_public);
  const isDefault = readOptionalBoolean(stream.is_default);
  const isRecentlyActive = readOptionalBoolean(stream.is_recently_active);
  const subscriberCount = readOptionalCount(stream.subscriber_count);
  const weeklyTraffic = readOptionalCount(stream.stream_weekly_traffic);
  const postPolicy = readOptionalPolicy(stream.stream_post_policy);
  const creatorId = readOptionalCreatorId(stream.creator_id);
  const dateCreated = readOptionalUnixTimestamp(stream.date_created);
  const folderId = readOptionalCount(stream.folder_id);
  const messageRetentionDays = readOptionalCount(stream.message_retention_days);
  const canSubscribeGroup = readOptionalGroupSetting(stream.can_subscribe_group);
  const canAddSubscribersGroup = readOptionalGroupSetting(stream.can_add_subscribers_group);
  const canRemoveSubscribersGroup = readOptionalGroupSetting(stream.can_remove_subscribers_group);
  const canAdministerChannelGroup = readOptionalGroupSetting(stream.can_administer_channel_group);
  const canResolveTopicsGroup = readOptionalGroupSetting(stream.can_resolve_topics_group);
  const canMoveMessagesOutOfChannelGroup = readOptionalGroupSetting(
    stream.can_move_messages_out_of_channel_group,
  );
  return {
    stream_id: stream.stream_id,
    name: stream.name,
    description: stream.description ?? "",
    is_announcement_only: stream.is_announcement_only === true,
    ...(inviteOnly != null ? { invite_only: inviteOnly } : {}),
    ...(historyPublic != null ? { history_public_to_subscribers: historyPublic } : {}),
    ...(isWebPublic != null ? { is_web_public: isWebPublic } : {}),
    ...(subscriberCount !== undefined ? { subscriber_count: subscriberCount } : {}),
    ...(weeklyTraffic !== undefined ? { stream_weekly_traffic: weeklyTraffic } : {}),
    ...(postPolicy !== undefined ? { stream_post_policy: postPolicy } : {}),
    ...(creatorId !== undefined ? { creator_id: creatorId } : {}),
    ...(dateCreated !== undefined ? { date_created: dateCreated } : {}),
    ...(folderId !== undefined ? { folder_id: folderId } : {}),
    ...(isDefault != null ? { is_default: isDefault } : {}),
    ...(isRecentlyActive != null ? { is_recently_active: isRecentlyActive } : {}),
    ...(messageRetentionDays !== undefined ? { message_retention_days: messageRetentionDays } : {}),
    ...(canSubscribeGroup != null ? { can_subscribe_group: canSubscribeGroup } : {}),
    ...(canAddSubscribersGroup != null
      ? { can_add_subscribers_group: canAddSubscribersGroup }
      : {}),
    ...(canRemoveSubscribersGroup != null
      ? { can_remove_subscribers_group: canRemoveSubscribersGroup }
      : {}),
    ...(canAdministerChannelGroup != null
      ? { can_administer_channel_group: canAdministerChannelGroup }
      : {}),
    ...(canResolveTopicsGroup != null ? { can_resolve_topics_group: canResolveTopicsGroup } : {}),
    ...(canMoveMessagesOutOfChannelGroup != null
      ? { can_move_messages_out_of_channel_group: canMoveMessagesOutOfChannelGroup }
      : {}),
  };
}

export async function fetchStreams(): Promise<MockStream[]> {
  const client = await getClient();
  const data = await client.streams.retrieve();
  const list = data.streams ?? [];
  return list.map(parseRawStream);
}

export async function resolveStreamIdByName(
  streamName: string,
): Promise<ResolveStreamIdByNameResult> {
  const normalizedName = guard.nonEmpty(streamName, "resolveStreamIdByName.streamName").trim();
  const res = await zulipPipelineGet("/get_stream_id", { stream: normalizedName });
  if (res == null) {
    return { ok: false, kind: "transient" };
  }
  if (!res.ok) {
    if (res.status === 403) {
      return { ok: false, kind: "forbidden" };
    }
    if (res.status === 400 || res.status === 404) {
      return { ok: false, kind: "not_found" };
    }
    return { ok: false, kind: "transient" };
  }

  const data = res.data as {
    result?: string;
    stream_id?: unknown;
    code?: string;
  };
  if (data.result === "error") {
    if (data.code === "BAD_REQUEST" || data.code === "STREAM_DOES_NOT_EXIST") {
      return { ok: false, kind: "not_found" };
    }
    if (data.code === "UNAUTHORIZED_PRINCIPAL" || data.code === "UNAUTHORIZED") {
      return { ok: false, kind: "forbidden" };
    }
    return { ok: false, kind: "transient" };
  }

  const streamId =
    typeof data.stream_id === "number" && Number.isInteger(data.stream_id) && data.stream_id > 0
      ? data.stream_id
      : null;
  if (streamId == null) {
    return { ok: false, kind: "transient" };
  }

  return { ok: true, streamId };
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

/** Removes members from a stream (DELETE /users/me/subscriptions with principals). */
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
  return fetchStreamTopicNames(streamObj.stream_id);
}

/** Loads topic names for a stream id (used for sidebar expand topic list). */
export async function fetchStreamTopicNames(
  streamId: number,
  signal?: AbortSignal,
): Promise<string[]> {
  guard.streamId(streamId, "fetchStreamTopicNames.streamId");
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  const res = await zulipPipelineGet(
    `/users/me/${streamId}/topics`,
    {
      allow_empty_topic_name: "true",
    },
    signal,
  );
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  if (!res?.ok) {
    return [];
  }
  const data = res.data as { result?: string; topics?: { name?: string }[] };
  if (data.result === "error") {
    return [];
  }
  return (data.topics ?? []).map((topic) => topic.name ?? "");
}

/** Updates stream metadata (PATCH /api/v1/streams/{stream_id}). */
export async function updateStream(
  streamId: number,
  params: { name?: string; description?: string; isArchived?: boolean },
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
  if (params.isArchived !== undefined) {
    // Zulip expects boolean PATCH fields as strings in form-encoded bodies.
    body.is_archived = params.isArchived ? "true" : "false";
  }
  if (Object.keys(body).length === 0) {
    return true;
  }

  try {
    const res = await zulipPipelinePatch(`streams/${streamId}`, body);
    if (!res.ok) return false;
    const data = res.data as StreamPatchResponsePayload;
    return data.result !== "error";
  } catch {
    return false;
  }
}

/**
 * Unarchives a channel: PATCH streams/{id} with is_archived=false.
 * Older servers may succeed but list `is_archived` in ignored_parameters_unsupported — treat as unsupported.
 */
export async function unarchiveStream(streamId: number): Promise<UnarchiveStreamResult> {
  guard.streamId(streamId, "unarchiveStream.streamId");
  try {
    const res = await zulipPipelinePatch(`streams/${streamId}`, { is_archived: "false" });
    const data = (res.data ?? {}) as StreamPatchResponsePayload;

    if (!res.ok || data.result === "error") {
      return {
        ok: false,
        status: res.status,
        kind: mapStreamPatchErrorKind(res.status),
        message: readStreamPatchErrorMessage(data, res.status, "Failed to unarchive channel"),
        ...(typeof data.code === "string" ? { code: data.code } : {}),
      };
    }

    if (includesUnsupportedIsArchivedParameter(data.ignored_parameters_unsupported)) {
      return {
        ok: false,
        status: res.status,
        kind: "unsupported",
        message: "is_archived is not supported on this server",
      };
    }

    return { ok: true };
  } catch (err) {
    log.warn("unarchiveStream request failed", { streamId, error: String(err) });
    return {
      ok: false,
      status: 0,
      kind: "transient",
      message: String(err),
    };
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
