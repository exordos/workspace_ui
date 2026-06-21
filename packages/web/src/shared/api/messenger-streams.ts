/**
 * Workspace streams, subscriptions, topics, and stream admin API.
 */
import { guard } from "~/shared/lib/guards";
import { createLogger } from "~/shared/lib/logger";
import {
  compareUserIds,
  isUserIdentityReady,
  type UserId,
  userIdStorageKey,
} from "~/shared/lib/user-id.lib";
import { getMessengerGatewayApiBaseForCurrentInstance, messengerApi } from "./client";
import {
  messengerPipelineDelete,
  messengerPipelineGet,
  messengerPipelinePost,
  messengerPipelinePatch,
} from "./messenger-pipeline.internal";
import {
  buildCreatePrivateMessageStreamBody,
  buildCreateStreamBindingBody,
  parseCreatedWorkspaceStream,
} from "./messenger-private-stream-create.lib";
import type { MockStream, MessengerMeStream, MessengerSubscription } from "./messenger.types";

const log = createLogger("messenger-streams");

export interface AddStreamMembersParams {
  streamName: string;
  userIds: UserId[];
  authorizationErrorsFatal?: boolean;
}

export interface AddStreamMembersResult {
  ok: boolean;
  addedUserIds: UserId[];
  alreadySubscribedUserIds: UserId[];
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

function normalizePrincipalUserIds(userIds: readonly UserId[]): UserId[] {
  const byKey = new Map<string, UserId>();
  for (const userId of userIds) {
    if (!isUserIdentityReady(userId)) continue;
    byKey.set(userIdStorageKey(userId), userId);
  }
  return Array.from(byKey.values()).sort(compareUserIds);
}

export interface DeleteTopicResult {
  ok: boolean;
  complete: boolean;
  attempts: number;
  errorCode?: string;
}

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function readUuid(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim().toLowerCase();
  return UUID_RE.test(trimmed) ? trimmed : undefined;
}

function readTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readOptionalPositiveInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return undefined;
  }
  return value;
}

function extractMeStreamItems(data: unknown): unknown[] {
  if (Array.isArray(data)) {
    return data;
  }
  if (!isRecord(data)) {
    return [];
  }
  if (Array.isArray(data.streams)) {
    return data.streams;
  }
  if (Array.isArray(data.results)) {
    return data.results;
  }
  return [];
}

function parseMeStream(row: unknown): MessengerMeStream | null {
  if (!isRecord(row)) {
    return null;
  }
  const uuid = readUuid(row.uuid);
  const name = readTrimmedString(row.name);
  const sourceStreamUuid = readUuid(row.source_stream_uuid);
  if (uuid == null || name == null || sourceStreamUuid == null) {
    return null;
  }
  // The row id is the per-user stream identity referenced by message rows as user_stream_uuid.
  // The backend exposes source_stream_uuid separately for writes.
  const streamUuid = uuid;
  const projectId = readUuid(row.project_id);
  const userUuid = readUuid(row.user_uuid);
  const source = isRecord(row.source) ? row.source : undefined;
  // Numeric Zulip id lives in `source.stream_id` for zulip-sourced streams; tolerate a top-level one too.
  const streamId =
    readOptionalPositiveInteger(row.stream_id) ?? readOptionalPositiveInteger(source?.stream_id);
  const createdAt = readOptionalString(row.created_at);
  const updatedAt = readOptionalString(row.updated_at);
  const lastSyncedAt = readOptionalString(row.last_synced_at);
  const sourceName = readOptionalString(row.source_name);
  return {
    uuid,
    name,
    description: typeof row.description === "string" ? row.description : "",
    ...(projectId != null ? { project_id: projectId } : {}),
    ...(createdAt != null ? { created_at: createdAt } : {}),
    ...(updatedAt != null ? { updated_at: updatedAt } : {}),
    ...(userUuid != null ? { user_uuid: userUuid } : {}),
    stream_uuid: streamUuid,
    source_stream_uuid: sourceStreamUuid,
    ...(lastSyncedAt != null ? { last_synced_at: lastSyncedAt } : {}),
    ...(sourceName != null ? { source_name: sourceName } : {}),
    ...(source != null ? { source } : {}),
    invite_only: row.invite_only === true,
    announce: row.announce === true,
    private: row.private === true,
    ...(streamId != null ? { stream_id: streamId } : {}),
  };
}

export async function fetchMyStreams(): Promise<MessengerMeStream[]> {
  const res = await messengerApi.getWithBase(
    getMessengerGatewayApiBaseForCurrentInstance(),
    "/me/streams/",
  );
  if (!res.ok) {
    return [];
  }
  return extractMeStreamItems(res.data)
    .map((row) => parseMeStream(row))
    .filter((row): row is MessengerMeStream => row != null);
}

export interface DirectMessageStreamRef {
  streamUuid: string;
  sourceStreamUuid: string;
  userUuid: string;
  name: string;
}

interface WorkspaceStreamBindingRef {
  stream_uuid: string;
  user_uuid: string;
}

function extractStreamBindingItems(data: unknown): unknown[] {
  if (Array.isArray(data)) {
    return data;
  }
  if (!isRecord(data)) {
    return [];
  }
  if (Array.isArray(data.results)) {
    return data.results;
  }
  return [];
}

function parseStreamBinding(row: unknown): WorkspaceStreamBindingRef | null {
  if (!isRecord(row)) {
    return null;
  }
  const streamUuid = readUuid(row.stream_uuid);
  const userUuid = readUuid(row.user_uuid);
  if (streamUuid == null || userUuid == null) {
    return null;
  }
  return { stream_uuid: streamUuid, user_uuid: userUuid };
}

async function fetchStreamBindings(): Promise<WorkspaceStreamBindingRef[]> {
  const response = await messengerApi.getWithBase(
    getMessengerGatewayApiBaseForCurrentInstance(),
    "/stream_bindings/",
  );
  if (!response.ok) {
    log.warn("Stream bindings fetch failed", { status: response.status });
    return [];
  }
  return extractStreamBindingItems(response.data)
    .map(parseStreamBinding)
    .filter((binding): binding is WorkspaceStreamBindingRef => binding != null);
}

/** Finds an existing 1:1 private stream row for a peer IAM UUID through source stream bindings. */
export function findPrivateStreamForUserUuid(
  streams: readonly MessengerMeStream[],
  peerUserUuid: string,
  bindings: readonly WorkspaceStreamBindingRef[],
): MessengerMeStream | undefined {
  const normalizedPeer = peerUserUuid.trim().toLowerCase();
  const peerSourceStreamUuids = new Set(
    bindings
      .filter((binding) => binding.user_uuid.toLowerCase() === normalizedPeer)
      .map((binding) => binding.stream_uuid),
  );
  return streams.find(
    (stream) => stream.private && peerSourceStreamUuids.has(stream.source_stream_uuid),
  );
}

/** Creates a 1:1 private stream via gateway `POST /streams/`. */
export async function createPrivateMessageStream(options: {
  userUuid: UserId;
  displayName: string;
}): Promise<DirectMessageStreamRef | null> {
  const peerUuid = guard.userIdentity(options.userUuid, "createPrivateMessageStream.userUuid");
  if (typeof peerUuid !== "string") {
    return null;
  }

  try {
    const base = getMessengerGatewayApiBaseForCurrentInstance();
    const res = await messengerApi.postJsonWithBase(
      base,
      "/streams/",
      buildCreatePrivateMessageStreamBody({
        peerUserUuid: peerUuid,
        peerDisplayName: options.displayName,
      }),
    );
    if (!res.ok) {
      log.warn("Private stream creation failed", { status: res.status });
      return null;
    }
    const created = parseCreatedWorkspaceStream(res.data);
    if (created == null) {
      log.warn("Private stream creation returned invalid payload");
      return null;
    }

    const bindingRes = await messengerApi.postJsonWithBase(
      base,
      "/stream_bindings/",
      buildCreateStreamBindingBody({
        streamUuid: created.streamUuid,
        peerUserUuid: peerUuid,
      }),
    );
    if (!bindingRes.ok) {
      log.warn("Private stream peer binding failed", {
        status: bindingRes.status,
        streamUuid: created.streamUuid,
      });
      return null;
    }

    log.info("Private stream created", { streamUuid: created.streamUuid });
    return {
      streamUuid: created.streamUuid,
      sourceStreamUuid: created.streamUuid,
      userUuid: peerUuid,
      name: created.name,
    };
  } catch (err) {
    log.error("Private stream creation error", { error: String(err) });
    return null;
  }
}

/** Returns existing private stream or creates one through the messenger gateway. */
export async function resolveOrCreateDirectMessageStream(
  peerUserId: UserId,
  peerDisplayName: string,
): Promise<DirectMessageStreamRef | null> {
  const peerUuid = guard.userIdentity(peerUserId, "resolveOrCreateDirectMessageStream.peerUserId");
  if (typeof peerUuid !== "string") {
    return null;
  }
  const streams = await fetchMyStreams();
  const bindings = await fetchStreamBindings();
  const existing = findPrivateStreamForUserUuid(streams, peerUuid, bindings);
  if (existing != null) {
    return {
      streamUuid: existing.stream_uuid,
      sourceStreamUuid: existing.source_stream_uuid,
      userUuid: peerUuid,
      name: existing.name,
    };
  }
  return createPrivateMessageStream({ userUuid: peerUuid, displayName: peerDisplayName });
}

function subscriptionFromMeStream(stream: MessengerMeStream): MessengerSubscription | null {
  if (stream.private || stream.stream_id == null) {
    return null;
  }
  return {
    stream_id: stream.stream_id,
    stream_uuid: stream.stream_uuid,
    source_stream_uuid: stream.source_stream_uuid,
    name: stream.name,
    is_muted: false,
    invite_only: stream.invite_only,
  };
}

/** Fetches the user's channel subscriptions from Workspace gateway /me/streams/. */
export async function fetchSubscriptions(): Promise<MessengerSubscription[]> {
  const gatewayStreams = await fetchMyStreams();
  return gatewayStreams
    .map((stream) => subscriptionFromMeStream(stream))
    .filter((stream): stream is MessengerSubscription => stream != null);
}

export async function fetchStreams(): Promise<MockStream[]> {
  const streams = await fetchMyStreams();
  return streams
    .filter((stream) => !stream.private && stream.stream_id != null)
    .map((stream) => ({
      stream_id: stream.stream_id!,
      stream_uuid: stream.stream_uuid,
      source_stream_uuid: stream.source_stream_uuid,
      name: stream.name,
      description: stream.description,
      is_announcement_only: stream.announce,
      invite_only: stream.invite_only,
    }));
}

/** Adds users to an existing stream (POST /users/me/subscriptions with principals). */
export async function addMembersToStream(
  params: AddStreamMembersParams,
): Promise<AddStreamMembersResult> {
  const streamName = guard.nonEmpty(params.streamName, "addMembersToStream.streamName").trim();
  const requestedUserIds = normalizePrincipalUserIds(params.userIds);

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
    const response = await messengerPipelinePost("/users/me/subscriptions", requestBody);
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
    const alreadySubscribedKeys = new Set(alreadySubscribedUserIds.map(userIdStorageKey));
    const addedUserIds = hasPrincipalMap(payload.subscribed)
      ? addedFromPayload
      : requestedUserIds.filter((userId) => !alreadySubscribedKeys.has(userIdStorageKey(userId)));

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
    const response = await messengerPipelineDelete("/users/me/subscriptions", requestBody);
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
  const res = await messengerPipelineGet(`/streams/${streamId}/members`);
  if (!res?.ok) {
    return [];
  }
  const data = res.data as { result?: string; subscribers?: number[] };
  if (data.result === "error") return [];
  return data.subscribers ?? [];
}

export async function fetchTopics(stream: string): Promise<string[]> {
  const streamName = guard.nonEmpty(stream, "fetchTopics.stream");
  const streamsData = await fetchStreams();
  const streamObj = streamsData.find((s) => s.name === streamName);
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
  const res = await messengerPipelineGet(
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
    // Workspace expects boolean PATCH fields as strings in form-encoded bodies.
    body.is_archived = params.isArchived ? "true" : "false";
  }
  if (Object.keys(body).length === 0) {
    return true;
  }

  try {
    const res = await messengerPipelinePatch(`streams/${streamId}`, body);
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
    const res = await messengerPipelinePatch(`streams/${streamId}`, { is_archived: "false" });
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
    const res = await messengerPipelineDelete(`streams/${streamId}`);
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
      const res = await messengerPipelinePost(`/streams/${streamId}/delete_topic`, {
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
