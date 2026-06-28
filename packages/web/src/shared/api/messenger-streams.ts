/**
 * Workspace streams, subscriptions, topics, and stream admin API.
 */
import { guard } from "~/shared/lib/guards";
import { createLogger } from "~/shared/lib/logger";
import {
  parseWorkspaceStreamNotificationMode,
  WORKSPACE_DEFAULT_STREAM_NOTIFICATION_MODE,
} from "~/shared/lib/stream-notification-resolve.lib";
import {
  parseWorkspaceTopicNotificationMode,
  WORKSPACE_DEFAULT_TOPIC_NOTIFICATION_MODE,
} from "~/shared/lib/topic-notification-resolve.lib";
import {
  compareUserIds,
  isIamUserUuid,
  isUserIdentityReady,
  type UserId,
  userIdStorageKey,
} from "~/shared/lib/user-id.lib";
import {
  getMessengerGatewayApiBaseForCurrentInstance,
  getMessengerWorkspaceApiBaseForCurrentInstance,
  messengerApi,
} from "./client";
import {
  buildAddStreamUsersBody,
  buildCreatePrivateMessageStreamBody,
  MESSENGER_STREAM_BINDING_ROLE_MEMBER,
  MESSENGER_STREAM_SOURCE_NAME_NATIVE,
  parseCreatedWorkspaceStream,
} from "./messenger-private-stream-create.lib";
import type {
  MockStream,
  MessengerMeStream,
  MessengerStreamTopic,
  MessengerSubscription,
  WorkspaceStreamNotificationMode,
  WorkspaceStreamBinding,
  WorkspaceStreamRole,
} from "./messenger.types";

const log = createLogger("messenger-streams");

export interface AddStreamMembersParams {
  streamUuid: string;
  streamName?: string;
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

export interface CreateWorkspaceStreamParams {
  name: string;
  description?: string;
  inviteOnly?: boolean;
  announce?: boolean;
  private?: boolean;
  memberUserIds?: readonly UserId[];
}

export interface CreateWorkspaceStreamResult {
  streamUuid: string;
  name: string;
  boundUserIds: UserId[];
}

function normalizePrincipalUserIds(userIds: readonly UserId[]): UserId[] {
  const byKey = new Map<string, UserId>();
  for (const userId of userIds) {
    if (!isUserIdentityReady(userId)) continue;
    byKey.set(userIdStorageKey(userId), userId);
  }
  return Array.from(byKey.values()).sort(compareUserIds);
}

function normalizeIamUserUuids(userIds: readonly UserId[]): string[] {
  return normalizePrincipalUserIds(userIds)
    .filter((userId): userId is string => isIamUserUuid(userId))
    .map((userId) => userId.trim().toLowerCase());
}

function excludeUserUuid(
  userIds: readonly UserId[],
  excludedUserUuid: string | undefined,
): UserId[] {
  if (excludedUserUuid == null) {
    return [...userIds];
  }
  const normalizedExcluded = excludedUserUuid.trim().toLowerCase();
  return userIds.filter(
    (userId) => !(typeof userId === "string" && userId.trim().toLowerCase() === normalizedExcluded),
  );
}

function buildCreateWorkspaceStreamBody(params: CreateWorkspaceStreamParams): {
  name: string;
  description: string;
  source_name: typeof MESSENGER_STREAM_SOURCE_NAME_NATIVE;
  source: { kind: typeof MESSENGER_STREAM_SOURCE_NAME_NATIVE };
  invite_only: boolean;
  announce: boolean;
  private: boolean;
} {
  return {
    name: guard.nonEmpty(params.name, "createWorkspaceStream.name").trim(),
    description: params.description?.trim() ?? "",
    source_name: MESSENGER_STREAM_SOURCE_NAME_NATIVE,
    source: { kind: MESSENGER_STREAM_SOURCE_NAME_NATIVE },
    invite_only: params.inviteOnly === true,
    announce: params.announce === true,
    private: params.private === true,
  };
}

async function bindUsersToStream(params: {
  base: string;
  streamUuid: string;
  userIds: readonly UserId[];
  role: typeof MESSENGER_STREAM_BINDING_ROLE_MEMBER;
}): Promise<UserId[] | null> {
  const streamUuid = guard.streamUuid(params.streamUuid, "bindUsersToStream.streamUuid");
  const userUuids = normalizeIamUserUuids(params.userIds);
  const boundUserIds: UserId[] = [];

  if (userUuids.length === 0) {
    return boundUserIds;
  }

  const response = await messengerApi.postJsonWithBase(
    params.base,
    `/streams/${streamUuid}/actions/add_users/invoke`,
    buildAddStreamUsersBody({
      userUuids,
      role: params.role,
    }),
  );
  if (!response.ok) {
    log.warn("Stream binding action failed", { status: response.status, streamUuid });
    return null;
  }

  boundUserIds.push(...userUuids);
  return boundUserIds;
}

export interface DeleteTopicResult {
  ok: boolean;
  complete: boolean;
  attempts: number;
  errorCode?: string;
}

export interface UpdateStreamTopicResult {
  ok: boolean;
  topic: MessengerStreamTopic | null;
  errorCode?: string;
}

/** PUT /streams/{id} response fields relevant to stream updates. */
interface StreamUpdateResponsePayload {
  result?: string;
  msg?: string;
  code?: string;
}

export type StreamUnarchiveErrorKind = "transient" | "forbidden" | "invalid";

export type UnarchiveStreamResult =
  | { ok: true }
  | {
      ok: false;
      kind: StreamUnarchiveErrorKind;
      message: string;
      status: number;
      code?: string;
    };

function mapStreamUpdateErrorKind(status: number): StreamUnarchiveErrorKind {
  if (status === 403) return "forbidden";
  if (status === 400) return "invalid";
  return "transient";
}

function readStreamUpdateErrorMessage(
  data: StreamUpdateResponsePayload,
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

function readSafeCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.trunc(value));
}

function readStreamNotificationMode(value: unknown): WorkspaceStreamNotificationMode | undefined {
  return parseWorkspaceStreamNotificationMode(value) ?? undefined;
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
  if (uuid == null || name == null) {
    return null;
  }
  const streamUuid = uuid;
  const projectId = readUuid(row.project_id);
  const userUuid = readUuid(row.user_uuid);
  const owner = readUuid(row.owner);
  const source = isRecord(row.source) ? row.source : undefined;
  const createdAt = readOptionalString(row.created_at);
  const updatedAt = readOptionalString(row.updated_at);
  const lastSyncedAt = readOptionalString(row.last_synced_at);
  const sourceName = readOptionalString(row.source_name);
  const notificationMode = readStreamNotificationMode(row.notification_mode);
  return {
    uuid,
    name,
    description: typeof row.description === "string" ? row.description : "",
    ...(projectId != null ? { project_id: projectId } : {}),
    ...(createdAt != null ? { created_at: createdAt } : {}),
    ...(updatedAt != null ? { updated_at: updatedAt } : {}),
    ...(userUuid != null ? { user_uuid: userUuid } : {}),
    ...(owner != null ? { owner } : {}),
    stream_uuid: streamUuid,
    ...(lastSyncedAt != null ? { last_synced_at: lastSyncedAt } : {}),
    ...(sourceName != null ? { source_name: sourceName } : {}),
    ...(source != null ? { source } : {}),
    invite_only: row.invite_only === true,
    announce: row.announce === true,
    private: row.private === true,
    is_archived: row.is_archived === true,
    unread_count: readSafeCount(row.unread_count),
    notification_mode: notificationMode ?? WORKSPACE_DEFAULT_STREAM_NOTIFICATION_MODE,
  };
}

export async function fetchMyStreams(): Promise<MessengerMeStream[]> {
  const res = await messengerApi.getWithBase(
    getMessengerGatewayApiBaseForCurrentInstance(),
    "/streams/",
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
  userUuid: string;
  name: string;
}

const WORKSPACE_STREAM_ROLES: ReadonlySet<WorkspaceStreamRole> = new Set([
  "guest",
  "member",
  "moderator",
  "administrator",
  "owner",
]);

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

function readWorkspaceStreamRole(value: unknown): WorkspaceStreamRole | null {
  if (typeof value !== "string") {
    return null;
  }
  const role = value.trim().toLowerCase();
  return WORKSPACE_STREAM_ROLES.has(role as WorkspaceStreamRole)
    ? (role as WorkspaceStreamRole)
    : null;
}

function parseStreamBinding(row: unknown): WorkspaceStreamBinding | null {
  if (!isRecord(row)) {
    return null;
  }
  const uuid = readUuid(row.uuid);
  const streamUuid = readUuid(row.stream_uuid);
  const userUuid = readUuid(row.user_uuid);
  if (uuid == null || streamUuid == null || userUuid == null) {
    return null;
  }
  return {
    uuid,
    stream_uuid: streamUuid,
    user_uuid: userUuid,
    role: readWorkspaceStreamRole(row.role) ?? "member",
  };
}

async function fetchStreamBindings(): Promise<WorkspaceStreamBinding[]> {
  const response = await messengerApi.getWithBase(
    getMessengerWorkspaceApiBaseForCurrentInstance(),
    "/stream_bindings/",
  );
  if (!response.ok) {
    log.warn("Stream bindings fetch failed", { status: response.status });
    return [];
  }
  return extractStreamBindingItems(response.data)
    .map(parseStreamBinding)
    .filter((binding): binding is WorkspaceStreamBinding => binding != null);
}

export async function fetchStreamMemberBindings(
  streamUuid: string,
): Promise<WorkspaceStreamBinding[]> {
  const normalizedStreamUuid = readUuid(streamUuid);
  if (normalizedStreamUuid == null) {
    return [];
  }
  const bindings = await fetchStreamBindings();
  return bindings.filter((binding) => binding.stream_uuid === normalizedStreamUuid);
}

export async function deleteStreamBinding(bindingUuid: string): Promise<boolean> {
  const normalizedBindingUuid = guard.streamUuid(bindingUuid, "deleteStreamBinding.bindingUuid");
  try {
    const response = await messengerApi.deleteWithBase(
      getMessengerWorkspaceApiBaseForCurrentInstance(),
      `/stream_bindings/${normalizedBindingUuid}`,
    );
    if (!response.ok) return false;
    const data = isRecord(response.data) ? (response.data as StreamUpdateResponsePayload) : {};
    return data.result !== "error";
  } catch (error) {
    log.warn("Stream binding delete request failed", {
      bindingUuid: normalizedBindingUuid,
      error: String(error),
    });
    return false;
  }
}

export async function updateStreamBindingRole(
  bindingUuid: string,
  role: WorkspaceStreamRole,
): Promise<boolean> {
  const normalizedBindingUuid = guard.streamUuid(
    bindingUuid,
    "updateStreamBindingRole.bindingUuid",
  );
  if (!WORKSPACE_STREAM_ROLES.has(role)) {
    return false;
  }
  try {
    const response = await messengerApi.putJsonWithBase(
      getMessengerWorkspaceApiBaseForCurrentInstance(),
      `/stream_bindings/${normalizedBindingUuid}`,
      { role },
    );
    if (!response.ok) return false;
    const data = isRecord(response.data) ? (response.data as StreamUpdateResponsePayload) : {};
    return data.result !== "error";
  } catch (error) {
    log.warn("Stream binding role update request failed", {
      bindingUuid: normalizedBindingUuid,
      role,
      error: String(error),
    });
    return false;
  }
}

export async function fetchStreamMembers(streamUuid: string): Promise<UserId[]> {
  const bindings = await fetchStreamMemberBindings(streamUuid);
  return bindings.map((binding) => binding.user_uuid);
}

function extractStreamTopicItems(data: unknown): unknown[] {
  if (Array.isArray(data)) {
    return data;
  }
  if (!isRecord(data)) {
    return [];
  }
  if (Array.isArray(data.stream_topics)) {
    return data.stream_topics;
  }
  if (Array.isArray(data.topics)) {
    return data.topics;
  }
  if (Array.isArray(data.results)) {
    return data.results;
  }
  return [];
}

function parseStreamTopic(row: unknown): MessengerStreamTopic | null {
  if (!isRecord(row)) {
    return null;
  }
  const uuid = readUuid(row.uuid);
  const streamUuid = readUuid(row.stream_uuid);
  const name = readTrimmedString(row.name);
  if (uuid == null || streamUuid == null || name == null) {
    return null;
  }
  const projectId = readUuid(row.project_id);
  const createdAt = readOptionalString(row.created_at);
  const updatedAt = readOptionalString(row.updated_at);
  return {
    uuid,
    name,
    stream_uuid: streamUuid,
    unread_count: readSafeCount(row.unread_count),
    is_default: row.is_default === true,
    is_done: row.is_done === true,
    notification_mode:
      parseWorkspaceTopicNotificationMode(row.notification_mode) ??
      WORKSPACE_DEFAULT_TOPIC_NOTIFICATION_MODE,
    ...(projectId != null ? { project_id: projectId } : {}),
    ...(createdAt != null ? { created_at: createdAt } : {}),
    ...(updatedAt != null ? { updated_at: updatedAt } : {}),
  };
}

export async function fetchStreamTopics(
  streamUuid?: string,
  signal?: AbortSignal,
): Promise<MessengerStreamTopic[]> {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  const normalizedStreamUuid = streamUuid == null ? undefined : readUuid(streamUuid);
  if (streamUuid != null && normalizedStreamUuid == null) {
    return [];
  }
  const response = await messengerApi.getWithBase(
    getMessengerWorkspaceApiBaseForCurrentInstance(),
    "/stream_topics/",
    normalizedStreamUuid != null ? { stream_uuid: normalizedStreamUuid } : undefined,
    signal,
  );
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  if (!response.ok) {
    log.warn("Stream topics fetch failed", { status: response.status });
    return [];
  }
  return extractStreamTopicItems(response.data)
    .map(parseStreamTopic)
    .filter((topic): topic is MessengerStreamTopic => topic != null);
}

export async function createStreamTopic(params: {
  streamUuid: string;
  name: string;
}): Promise<MessengerStreamTopic | null> {
  const streamUuid = guard.streamUuid(params.streamUuid, "createStreamTopic.streamUuid");
  const name = guard.nonEmpty(params.name, "createStreamTopic.name").trim();
  const response = await messengerApi.postJsonWithBase(
    getMessengerWorkspaceApiBaseForCurrentInstance(),
    "/stream_topics/",
    {
      stream_uuid: streamUuid,
      name,
    },
  );
  if (!response.ok) {
    log.warn("Stream topic creation failed", { status: response.status, streamUuid });
    return null;
  }
  const topic = parseStreamTopic(response.data);
  if (topic == null) {
    log.warn("Stream topic creation returned invalid payload", { streamUuid });
    return null;
  }
  return topic;
}

/** Updates a stream topic entity through Workspace `PUT /stream_topics/{topic_uuid}`. */
export async function updateStreamTopic(params: {
  topicUuid: string;
  streamUuid?: string;
  name?: string;
}): Promise<UpdateStreamTopicResult> {
  const topicUuid = readUuid(params.topicUuid);
  if (topicUuid == null) {
    return { ok: false, topic: null, errorCode: "invalid_topic_uuid" };
  }

  const body: Record<string, string> = {};
  if (params.name !== undefined) {
    const name = readTrimmedString(params.name);
    if (name == null) {
      return { ok: false, topic: null, errorCode: "invalid_topic_name" };
    }
    body.name = name;
  }
  if (params.streamUuid !== undefined) {
    const streamUuid = readUuid(params.streamUuid);
    if (streamUuid == null) {
      return { ok: false, topic: null, errorCode: "invalid_stream_uuid" };
    }
    body.stream_uuid = streamUuid;
  }
  if (Object.keys(body).length === 0) {
    return { ok: false, topic: null, errorCode: "empty_update" };
  }

  try {
    const response = await messengerApi.putJsonWithBase(
      getMessengerWorkspaceApiBaseForCurrentInstance(),
      `/stream_topics/${topicUuid}`,
      body,
    );
    if (!response.ok) {
      return { ok: false, topic: null, errorCode: `http_${response.status}` };
    }
    const data = isRecord(response.data) ? response.data : {};
    if (data.result === "error") {
      const code = typeof data.code === "string" ? data.code : undefined;
      return { ok: false, topic: null, errorCode: code ?? "unknown_error" };
    }
    const topic = parseStreamTopic(response.data);
    if (topic == null) {
      log.warn("Stream topic update returned invalid payload", {
        topicUuid,
        streamUuid: body.stream_uuid,
      });
      return { ok: false, topic: null, errorCode: "invalid_response" };
    }
    return { ok: true, topic };
  } catch {
    return { ok: false, topic: null, errorCode: "network_error" };
  }
}

/** Toggles the server-owned done state for a stream topic. */
export async function toggleStreamTopicDone(topicUuid: string): Promise<UpdateStreamTopicResult> {
  const normalizedTopicUuid = readUuid(topicUuid);
  if (normalizedTopicUuid == null) {
    return { ok: false, topic: null, errorCode: "invalid_topic_uuid" };
  }

  try {
    const response = await messengerApi.postJsonWithBase(
      getMessengerWorkspaceApiBaseForCurrentInstance(),
      `/stream_topics/${normalizedTopicUuid}/actions/toggle_done/invoke`,
      {},
    );
    if (!response.ok) {
      return { ok: false, topic: null, errorCode: `http_${response.status}` };
    }
    const data = isRecord(response.data) ? response.data : {};
    if (data.result === "error") {
      const code = typeof data.code === "string" ? data.code : undefined;
      return { ok: false, topic: null, errorCode: code ?? "unknown_error" };
    }
    const topic = parseStreamTopic(response.data);
    if (topic == null) {
      log.warn("Stream topic done toggle returned invalid payload", {
        topicUuid: normalizedTopicUuid,
      });
      return { ok: false, topic: null, errorCode: "invalid_response" };
    }
    return { ok: true, topic };
  } catch {
    return { ok: false, topic: null, errorCode: "network_error" };
  }
}

/** Finds an existing 1:1 private stream row for a peer IAM UUID through stream bindings. */
export function findPrivateStreamForUserUuid(
  streams: readonly MessengerMeStream[],
  peerUserUuid: string,
  bindings: readonly WorkspaceStreamBinding[],
): MessengerMeStream | undefined {
  const normalizedPeer = peerUserUuid.trim().toLowerCase();
  const peerStreamUuids = new Set(
    bindings
      .filter((binding) => binding.user_uuid.toLowerCase() === normalizedPeer)
      .map((binding) => binding.stream_uuid),
  );
  return streams.find((stream) => stream.private && peerStreamUuids.has(stream.stream_uuid));
}

/** Creates or resolves a 1:1 private stream via native Workspace messenger `POST /streams/`. */
export async function createPrivateMessageStream(options: {
  userUuid: UserId;
  displayName: string;
}): Promise<DirectMessageStreamRef | null> {
  const peerUuid = guard.userIdentity(options.userUuid, "createPrivateMessageStream.userUuid");
  if (typeof peerUuid !== "string") {
    return null;
  }

  try {
    const base = getMessengerWorkspaceApiBaseForCurrentInstance();
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

    log.info("Private stream created", { streamUuid: created.streamUuid });
    return {
      streamUuid: created.streamUuid,
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
      userUuid: peerUuid,
      name: existing.name,
    };
  }
  return createPrivateMessageStream({ userUuid: peerUuid, displayName: peerDisplayName });
}

/** Creates a native Workspace stream and member bindings through the new Messenger API. */
export async function createWorkspaceStream(
  params: CreateWorkspaceStreamParams,
): Promise<CreateWorkspaceStreamResult | null> {
  const body = buildCreateWorkspaceStreamBody(params);
  const memberUserIds = params.memberUserIds ?? [];

  try {
    const base = getMessengerWorkspaceApiBaseForCurrentInstance();
    const response = await messengerApi.postJsonWithBase(base, "/streams/", body);
    if (!response.ok) {
      log.warn("Workspace stream creation failed", { status: response.status });
      return null;
    }

    const created = parseCreatedWorkspaceStream(response.data);
    if (created == null) {
      log.warn("Workspace stream creation returned invalid payload");
      return null;
    }

    const boundUserIds = await bindUsersToStream({
      base,
      streamUuid: created.streamUuid,
      userIds: excludeUserUuid(memberUserIds, created.ownerUserUuid),
      role: MESSENGER_STREAM_BINDING_ROLE_MEMBER,
    });
    if (boundUserIds == null) {
      return null;
    }

    return {
      streamUuid: created.streamUuid,
      name: created.name,
      boundUserIds,
    };
  } catch (error) {
    log.error("Workspace stream creation error", { error: String(error) });
    return null;
  }
}

function subscriptionFromMeStream(stream: MessengerMeStream): MessengerSubscription | null {
  return {
    stream_uuid: stream.stream_uuid,
    name: stream.name,
    notification_mode: stream.notification_mode,
    invite_only: stream.invite_only,
    private: stream.private,
    is_archived: stream.is_archived,
    ...(stream.owner != null ? { owner: stream.owner } : {}),
    unread_count: stream.unread_count,
  };
}

/** Fetches the user's channel subscriptions from Workspace gateway /streams/. */
export async function fetchSubscriptions(): Promise<MessengerSubscription[]> {
  const gatewayStreams = await fetchMyStreams();
  return gatewayStreams
    .map((stream) => subscriptionFromMeStream(stream))
    .filter((stream): stream is MessengerSubscription => stream != null);
}

export async function fetchStreams(): Promise<MockStream[]> {
  const streams = await fetchMyStreams();
  return streams
    .filter((stream) => !stream.private)
    .map((stream) => ({
      stream_uuid: stream.stream_uuid,
      name: stream.name,
      description: stream.description,
      is_announcement_only: stream.announce,
      invite_only: stream.invite_only,
      ...(stream.owner != null ? { owner: stream.owner } : {}),
    }));
}

/** Adds users to an existing stream when the backend supports member mutations. */
export async function addMembersToStream(
  params: AddStreamMembersParams,
): Promise<AddStreamMembersResult> {
  const streamUuid = guard.streamUuid(params.streamUuid, "addMembersToStream.streamUuid");
  const requestedUserIds = normalizePrincipalUserIds(params.userIds);
  const requestedUserUuids = normalizeIamUserUuids(requestedUserIds);

  if (requestedUserIds.length === 0) {
    return {
      ok: true,
      addedUserIds: [],
      alreadySubscribedUserIds: [],
      unauthorizedStreams: [],
    };
  }

  if (requestedUserUuids.length === 0) {
    return {
      ok: false,
      addedUserIds: [],
      alreadySubscribedUserIds: [],
      unauthorizedStreams: [],
      errorCode: "invalid_user",
    };
  }

  try {
    const boundUserIds = await bindUsersToStream({
      base: getMessengerWorkspaceApiBaseForCurrentInstance(),
      streamUuid,
      userIds: requestedUserUuids,
      role: MESSENGER_STREAM_BINDING_ROLE_MEMBER,
    });
    if (boundUserIds == null) {
      return {
        ok: false,
        addedUserIds: [],
        alreadySubscribedUserIds: [],
        unauthorizedStreams: [],
        errorCode: "binding_failed",
      };
    }
    return {
      ok: true,
      addedUserIds: boundUserIds,
      alreadySubscribedUserIds: [],
      unauthorizedStreams: [],
    };
  } catch (error) {
    log.warn("Stream member mutation failed", { streamUuid, error: String(error) });
    return {
      ok: false,
      addedUserIds: [],
      alreadySubscribedUserIds: [],
      unauthorizedStreams: [],
      errorCode: "network_error",
    };
  }
}

export async function fetchTopics(streamUuid: string): Promise<string[]> {
  const normalizedStreamUuid = guard.nonEmpty(streamUuid, "fetchTopics.streamUuid").trim();
  return fetchStreamTopics(normalizedStreamUuid).then((topics) =>
    topics.map((topic) => topic.name),
  );
}

/** Loads topic names for a stream UUID (used for sidebar expand topic list). */
export async function fetchStreamTopicNames(
  streamUuid: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const normalizedStreamUuid = guard
    .nonEmpty(streamUuid, "fetchStreamTopicNames.streamUuid")
    .trim();
  return fetchStreamTopics(normalizedStreamUuid, signal).then((topics) =>
    topics.map((topic) => topic.name),
  );
}

/** Updates stream metadata through Workspace `PUT /streams/{stream_uuid}`. */
export async function updateStream(
  streamId: string,
  params: { name?: string; description?: string },
): Promise<boolean> {
  const streamUuid = guard.streamUuid(streamId, "updateStream.streamId");
  const body: Record<string, string> = {};

  if (params.name !== undefined) {
    const trimmedName = params.name.trim();
    if (trimmedName.length === 0) {
      return false;
    }
    body.name = trimmedName;
  }
  if (params.description !== undefined) {
    body.description = params.description.trim();
  }
  if (Object.keys(body).length === 0) {
    return true;
  }

  try {
    const res = await messengerApi.putJsonWithBase(
      getMessengerWorkspaceApiBaseForCurrentInstance(),
      `/streams/${streamUuid}`,
      body,
    );
    if (!res.ok) return false;
    const data = (isRecord(res.data) ? res.data : {}) as StreamUpdateResponsePayload;
    return data.result !== "error";
  } catch {
    return false;
  }
}

type StreamArchiveAction = "archive" | "unarchive";

async function invokeStreamArchiveAction(
  streamId: string,
  action: StreamArchiveAction,
): Promise<UnarchiveStreamResult> {
  const streamUuid = guard.streamUuid(streamId, `${action}Stream.streamId`);
  try {
    const res = await messengerApi.postJsonWithBase(
      getMessengerWorkspaceApiBaseForCurrentInstance(),
      `/streams/${streamUuid}/actions/${action}/invoke`,
      {},
    );
    const data = (isRecord(res.data) ? res.data : {}) as StreamUpdateResponsePayload;

    if (!res.ok || data.result === "error") {
      return {
        ok: false,
        status: res.status,
        kind: mapStreamUpdateErrorKind(res.status),
        message: readStreamUpdateErrorMessage(data, res.status, `Failed to ${action} channel`),
        ...(typeof data.code === "string" ? { code: data.code } : {}),
      };
    }

    return { ok: true };
  } catch (err) {
    log.warn(`${action}Stream request failed`, { streamId: streamUuid, error: String(err) });
    return {
      ok: false,
      status: 0,
      kind: "transient",
      message: String(err),
    };
  }
}

/** Archives a channel through Workspace stream archive action. */
export async function archiveStream(streamId: string): Promise<boolean> {
  const result = await invokeStreamArchiveAction(streamId, "archive");
  return result.ok;
}

/** Unarchives a channel through Workspace stream unarchive action. */
export async function unarchiveStream(streamId: string): Promise<UnarchiveStreamResult> {
  return invokeStreamArchiveAction(streamId, "unarchive");
}

/** Deletes a stream through Workspace `DELETE /streams/{stream_uuid}`. */
export async function deleteStream(streamId: string): Promise<boolean> {
  const streamUuid = guard.streamUuid(streamId, "deleteStream.streamId");
  try {
    const res = await messengerApi.deleteWithBase(
      getMessengerWorkspaceApiBaseForCurrentInstance(),
      `/streams/${streamUuid}`,
    );
    if (!res.ok) return false;
    const data = isRecord(res.data) ? (res.data as StreamUpdateResponsePayload) : {};
    return data.result !== "error";
  } catch (error) {
    log.warn("deleteStream request failed", { streamId: streamUuid, error: String(error) });
    return false;
  }
}

/** Deletes a stream topic row through Workspace `DELETE /stream_topics/{topic_uuid}`. */
export async function deleteTopic(topicUuid: string): Promise<DeleteTopicResult> {
  const normalizedTopicUuid = readUuid(topicUuid);
  if (normalizedTopicUuid == null) {
    return { ok: false, complete: false, attempts: 0, errorCode: "invalid_topic_uuid" };
  }

  try {
    const res = await messengerApi.deleteWithBase(
      getMessengerWorkspaceApiBaseForCurrentInstance(),
      `/stream_topics/${normalizedTopicUuid}`,
    );
    if (!res.ok) {
      return {
        ok: false,
        complete: false,
        attempts: 1,
        errorCode: `http_${res.status}`,
      };
    }
    const data = res.data as { result?: string; code?: string };
    if (data.result === "error") {
      return {
        ok: false,
        complete: false,
        attempts: 1,
        errorCode: data.code ?? "unknown_error",
      };
    }
    return { ok: true, complete: true, attempts: 1 };
  } catch {
    return { ok: false, complete: false, attempts: 1, errorCode: "network_error" };
  }
}
