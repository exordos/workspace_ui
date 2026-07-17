/** Workspace realtime transport: REST epoch catch-up followed by WebSocket live events. */
import {
  getCurrentInstance,
  getWorkspaceCommonApiBaseForCurrentInstance,
  messengerApi,
} from "~/shared/api/client";
import { parseMessengerGatewayUser } from "~/shared/api/messenger-users.lib";
import type {
  MessengerCredentials,
  MessengerEvent,
  MessengerSource,
  MessengerSourceName,
  WorkspaceRawMessage,
} from "~/shared/api/messenger.types";
import { WORKSPACE_GATEWAY_V1_PATH } from "~/shared/config/workspace-api-layout";
import { WORKSPACE_PROJECT_UUID } from "~/shared/config/workspace-project";
import { resolveUserUuidFromAccessToken } from "~/shared/lib/access-token-claims.lib";
import { recordDiagnosticRealtimeEvent } from "~/shared/lib/diagnostics-realtime.lib";
import { attachEventLoopLifecycle } from "~/shared/lib/event-loop-lifecycle.lib";
import { resolveIamAccessToken, resolveIamApiOrigin } from "~/shared/lib/iam-instance.lib";
import { createLogger, logEvent } from "~/shared/lib/logger";
import { isOnline, onStatusChange } from "~/shared/lib/network";
import { parseProviderDeliveryMeta } from "~/shared/lib/provider-delivery.lib";
import { createResilientInterval } from "~/shared/lib/visibility";
import type { WorkspaceEvent, WorkspaceEventObjectType } from "~/shared/types/workspace-event";

const log = createLogger("realtime");

const WORKSPACE_EVENTS_PROTOCOL = "workspace.events.v1";
const WORKSPACE_REALTIME_WS_PATH = "/api/workspace/v1/events/ws";
const WORKSPACE_EVENTS_PATH = "/events/";
const WORKSPACE_EPOCH_PATH = "/epoch/";
const REALTIME_STORAGE_PREFIX = "workspace-realtime:last-epoch:v1:";
const REALTIME_GENERATION_SUFFIX = ":generation";
const CATCH_UP_PAGE_LIMIT = 500;
const MAX_CATCH_UP_PAGES = 20;
const MIN_RECONNECT_BACKOFF_MS = 1_000;
const MAX_RECONNECT_BACKOFF_MS = 30_000;
const REALTIME_WATCHDOG_INTERVAL_MS = 30_000;
const CLIENT_RECONNECT_CLOSE_CODE = 4000;
const CLIENT_OFFLINE_CLOSE_CODE = 4001;
const AUTH_CLOSE_CODES = new Set([4401, 4403]);
const EVENTS_CURSOR_EXPIRED_CLOSE_CODE = 4410;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WORKSPACE_EVENT_OBJECT_TYPES = new Set<WorkspaceEventObjectType>([
  "message",
  "message_reaction",
  "stream",
  "stream_binding",
  "topic",
  "user",
  "folder",
  "folder_item",
  "file",
  "external_account",
  "mail_folder",
  "mail_message",
  "calendar",
  "calendar_event",
]);

export interface StartMessengerEventLoopOptions {
  enabled?: boolean;
  onEvent: (event: WorkspaceEvent, delivery: MessengerEventDeliveryContext) => void | Promise<void>;
  onBadQueue?: () => void;
  /** Sole full-cache invalidation signal: REST 410 or websocket close 4410. */
  onCursorExpired?: () => void | Promise<void>;
  onQueueReady?: () => void;
  onTabStaleResume?: (hiddenDurationMs: number) => void;
  instanceId?: string;
  signal?: AbortSignal;
  eventTypes?: string[];
}

export interface MessengerEventDeliveryContext {
  source: "catchup" | "realtime";
  /** False only while replaying history before the first successful websocket ready. */
  notificationsAllowed: boolean;
}

export interface StartMessengerEventLoopForCredentialsOptions extends StartMessengerEventLoopOptions {
  credentials: MessengerCredentials;
}

interface RuntimeConfig {
  accessToken: string;
  fetchMode: "active-client" | "direct";
  messengerApiBaseUrl: string;
  storageKey: string;
  websocketApiBaseUrl: string;
}

interface LoopState {
  epochGeneration: string | null;
  forceImmediateReconnect: boolean;
  hasCompletedInitialReady: boolean;
  lastEpochVersion: number;
  socket: WebSocket | null;
  storageKey: string;
}

export interface NormalizedWorkspaceRealtimeEvent {
  epochVersion: number;
  event: WorkspaceEvent | null;
  skipReason?: string;
}

export interface AdaptedMessengerEvent {
  epochVersion: number;
  event: MessengerEvent | null;
  skipReason?: string;
}

interface SocketCloseInfo {
  code: number;
  reason: string;
  wasClean: boolean;
}

class RealtimeAuthStopError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RealtimeAuthStopError";
  }
}

class RealtimeHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "RealtimeHttpError";
  }
}

class UnsupportedRealtimeEventError extends Error {
  constructor(epochVersion: number, reason: string | undefined) {
    super(`Unsupported realtime event at epoch ${epochVersion}: ${reason ?? "unknown"}`);
    this.name = "UnsupportedRealtimeEventError";
  }
}

function hasCredentials(
  options: StartMessengerEventLoopOptions,
): options is StartMessengerEventLoopForCredentialsOptions {
  return "credentials" in options;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readWorkspaceEventObjectType(value: unknown): WorkspaceEventObjectType | null {
  const objectType = readString(value);
  return objectType != null &&
    WORKSPACE_EVENT_OBJECT_TYPES.has(objectType as WorkspaceEventObjectType)
    ? (objectType as WorkspaceEventObjectType)
    : null;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readMessengerSourceName(value: unknown): MessengerSourceName | undefined {
  return value === "native" || value === "zulip" ? value : undefined;
}

function readMessengerSource(value: unknown): MessengerSource | undefined {
  return isRecord(value) ? value : undefined;
}

function readMessageReactions(value: unknown): Record<string, number> {
  if (!isRecord(value)) {
    return {};
  }
  const reactions: Record<string, number> = {};
  for (const [emojiName, rawCount] of Object.entries(value)) {
    const count = typeof rawCount === "number" ? rawCount : Number(rawCount);
    if (emojiName.trim().length > 0 && Number.isFinite(count) && count > 0) {
      reactions[emojiName] = Math.floor(count);
    }
  }
  return reactions;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const strings = value.filter((item): item is string => typeof item === "string");
  return strings.length > 0 ? strings : undefined;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readNonNegativeInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return undefined;
  }
  return value;
}

function normalizeUuid(value: unknown): string | null {
  const raw = readString(value);
  if (raw == null || !UUID_RE.test(raw)) {
    return null;
  }
  return raw.toLowerCase();
}

function normalizeEpochVersion(value: unknown): number | null {
  const raw = typeof value === "number" ? value : Number(readString(value));
  if (!Number.isFinite(raw) || raw < 0) {
    return null;
  }
  return Math.floor(raw);
}

function currentEpochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function timestampFromValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }
  const raw = readString(value);
  if (raw == null) {
    return currentEpochSeconds();
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : currentEpochSeconds();
}

function userUuidsEqual(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const normalizedLeft = left?.trim().toLowerCase();
  const normalizedRight = right?.trim().toLowerCase();
  return normalizedLeft != null && normalizedRight != null && normalizedLeft === normalizedRight;
}

function buildStorageKey(identity: string): string {
  return `${REALTIME_STORAGE_PREFIX}${encodeURIComponent(identity)}`;
}

function buildAccountStorageIdentity(origin: string, projectId: string, userUuid: string): string {
  return `${origin.trim().replace(/\/+$/, "").toLowerCase()}|${projectId}|${userUuid}`;
}

function readEpochGeneration(storageKey: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return readString(window.localStorage.getItem(`${storageKey}${REALTIME_GENERATION_SUFFIX}`));
  } catch {
    return null;
  }
}

function writeEpochGeneration(storageKey: string, generation: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const key = `${storageKey}${REALTIME_GENERATION_SUFFIX}`;
    if (generation == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, generation);
  } catch {
    /* best-effort cursor persistence */
  }
}

function readLastEpochVersion(storageKey: string): number {
  if (typeof window === "undefined") {
    return 0;
  }
  try {
    return normalizeEpochVersion(window.localStorage.getItem(storageKey)) ?? 0;
  } catch {
    return 0;
  }
}

function writeLastEpochVersion(storageKey: string, epochVersion: number): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(storageKey, String(epochVersion));
  } catch {
    /* best-effort cursor persistence */
  }
}

function readRuntimeLastEpochVersion(runtime: RuntimeConfig): number {
  return readLastEpochVersion(runtime.storageKey);
}

function resetRuntimeLastEpochVersion(runtime: RuntimeConfig, state: LoopState): void {
  state.epochGeneration = null;
  state.lastEpochVersion = 0;
  writeLastEpochVersion(runtime.storageKey, 0);
  writeEpochGeneration(runtime.storageKey, null);
}

function resolveHttpBaseUrl(baseUrl: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
  const base = baseUrl.trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(base)) {
    return base;
  }
  const normalizedBase = base.startsWith("/") ? base : `/${base}`;
  return `${origin}${normalizedBase}`;
}

function buildResolvedHttpUrl(
  baseUrl: string,
  path: string,
  params?: Record<string, string>,
): string {
  const resolvedBase = resolveHttpBaseUrl(baseUrl);
  const cleanPath = path.replace(/^\//, "");
  const url = new URL(`${resolvedBase}/${cleanPath}`);
  if (params != null) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

function buildRealtimeWebSocketUrl(
  messengerApiBaseUrl: string,
  lastEpochVersion: number,
  epochGeneration: string | null,
): string {
  const baseUrl = new URL(resolveHttpBaseUrl(messengerApiBaseUrl));
  const url = new URL(WORKSPACE_REALTIME_WS_PATH, `${baseUrl.origin}/`);
  url.protocol = baseUrl.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("last_epoch_version", String(lastEpochVersion));
  if (lastEpochVersion > 0 && epochGeneration != null) {
    url.searchParams.set("epoch_generation", epochGeneration);
  }
  return url.toString();
}

function resolveRuntimeConfig(options: StartMessengerEventLoopOptions): RuntimeConfig | null {
  if (hasCredentials(options)) {
    const accessToken = options.credentials.accessToken.trim();
    const origin = resolveIamApiOrigin(options.credentials).replace(/\/+$/, "");
    const userUuid = resolveUserUuidFromAccessToken(accessToken);
    if (accessToken.length === 0 || origin.length === 0 || userUuid == null) {
      return null;
    }
    const identity = buildAccountStorageIdentity(origin, WORKSPACE_PROJECT_UUID, userUuid);
    return {
      accessToken,
      fetchMode: "direct",
      messengerApiBaseUrl: `${origin}${WORKSPACE_GATEWAY_V1_PATH}`,
      storageKey: buildStorageKey(identity),
      websocketApiBaseUrl: `${origin}${WORKSPACE_GATEWAY_V1_PATH}`,
    };
  }

  const instance = getCurrentInstance();
  if (instance == null) {
    return null;
  }
  const accessToken = resolveIamAccessToken(instance);
  if (accessToken.length === 0) {
    return null;
  }
  const websocketOrigin = resolveIamApiOrigin(instance).replace(/\/+$/, "");
  const messengerApiBaseUrl = getWorkspaceCommonApiBaseForCurrentInstance();
  const userUuid = resolveUserUuidFromAccessToken(accessToken);
  if (userUuid == null) return null;
  const identity = buildAccountStorageIdentity(websocketOrigin, WORKSPACE_PROJECT_UUID, userUuid);
  return {
    accessToken,
    fetchMode: "active-client",
    messengerApiBaseUrl,
    storageKey: buildStorageKey(identity),
    websocketApiBaseUrl:
      websocketOrigin.length > 0
        ? `${websocketOrigin}${WORKSPACE_GATEWAY_V1_PATH}`
        : messengerApiBaseUrl,
  };
}

function extractEventRows(data: unknown): unknown[] {
  if (Array.isArray(data)) {
    return data;
  }
  if (!isRecord(data)) {
    return [];
  }
  if (Array.isArray(data.results)) {
    return data.results;
  }
  if (Array.isArray(data.events)) {
    return data.events;
  }
  return [];
}

async function fetchCatchUpBatch(
  runtime: RuntimeConfig,
  afterEpochVersion: number,
  epochGeneration: string | null,
  signal: AbortSignal | undefined,
): Promise<unknown[]> {
  const params: Record<string, string> = {
    "epoch_version>": String(afterEpochVersion),
    page_limit: String(CATCH_UP_PAGE_LIMIT),
  };
  if (afterEpochVersion > 0 && epochGeneration != null) {
    params.epoch_generation = epochGeneration;
  }

  if (runtime.fetchMode === "active-client") {
    const res = await messengerApi.getWithBase(
      runtime.messengerApiBaseUrl,
      WORKSPACE_EVENTS_PATH,
      params,
      signal,
    );
    if (res.status === 401 || res.status === 403) {
      throw new RealtimeAuthStopError(`Realtime catch-up unauthorized (${res.status})`);
    }
    if (!res.ok) {
      throw new RealtimeHttpError(res.status, `Realtime catch-up failed (${res.status})`);
    }
    return extractEventRows(res.data);
  }

  const url = buildResolvedHttpUrl(runtime.messengerApiBaseUrl, WORKSPACE_EVENTS_PATH, params);
  const res = await fetch(url, {
    cache: "no-store",
    credentials: "same-origin",
    headers: { Authorization: `Bearer ${runtime.accessToken}` },
    signal,
  });
  if (res.status === 401 || res.status === 403) {
    throw new RealtimeAuthStopError(`Realtime catch-up unauthorized (${res.status})`);
  }
  if (!res.ok) {
    throw new RealtimeHttpError(res.status, `Realtime catch-up failed (${res.status})`);
  }
  try {
    return extractEventRows(await res.json());
  } catch {
    return [];
  }
}

interface ServerEpochCursor {
  epochGeneration: string;
  epochVersion: number;
}

function parseServerEpochCursor(data: unknown): ServerEpochCursor | null {
  if (!isRecord(data)) return null;
  const epochGeneration = readString(data.epoch_generation);
  const epochVersion = normalizeEpochVersion(data.epoch_version ?? data.current_epoch_version);
  return epochGeneration == null || epochVersion == null ? null : { epochGeneration, epochVersion };
}

async function fetchServerEpochCursor(
  runtime: RuntimeConfig,
  signal: AbortSignal | undefined,
): Promise<ServerEpochCursor> {
  let status: number;
  let data: unknown;
  if (runtime.fetchMode === "active-client") {
    const res = await messengerApi.getWithBase(
      runtime.messengerApiBaseUrl,
      WORKSPACE_EPOCH_PATH,
      undefined,
      signal,
    );
    status = res.status;
    data = res.data;
  } else {
    const res = await fetch(
      buildResolvedHttpUrl(runtime.messengerApiBaseUrl, WORKSPACE_EPOCH_PATH),
      {
        cache: "no-store",
        credentials: "same-origin",
        headers: { Authorization: `Bearer ${runtime.accessToken}` },
        signal,
      },
    );
    status = res.status;
    data = res.ok ? await res.json().catch(() => null) : null;
  }
  if (status === 401 || status === 403) {
    throw new RealtimeAuthStopError(`Realtime epoch unauthorized (${status})`);
  }
  const cursor = parseServerEpochCursor(data);
  if (status < 200 || status >= 300 || cursor == null) {
    throw new RealtimeHttpError(status, `Realtime epoch fetch failed (${status})`);
  }
  return cursor;
}

function messageFromWorkspaceEventPayload(
  payload: Record<string, unknown>,
  currentUserUuid: string | null,
): WorkspaceRawMessage | null {
  const messageUuid = normalizeUuid(payload.uuid);
  const streamUuid = normalizeUuid(payload.stream_uuid);
  const authorUuid = normalizeUuid(payload.author_uuid);
  if (messageUuid == null || streamUuid == null || authorUuid == null) {
    return null;
  }
  const contentPayload = isRecord(payload.payload) ? payload.payload : null;
  const content = readOptionalString(contentPayload?.content);
  if (content == null) {
    return null;
  }
  const topicUuid = normalizeUuid(payload.topic_uuid);
  const isOwn = readBoolean(payload.is_own, userUuidsEqual(authorUuid, currentUserUuid));
  const read = readBoolean(payload.read, isOwn);
  const mentioned = readBoolean(payload.mentioned, false);
  const sourceName = readMessengerSourceName(payload.source_name);
  const source = readMessengerSource(payload.source);
  const providerDelivery = parseProviderDeliveryMeta(payload);
  return {
    id: messageUuid,
    source_message_uuid: messageUuid,
    sender_id: 0,
    author_uuid: authorUuid,
    sender_uuid: authorUuid,
    is_own: isOwn,
    read,
    pinned: readBoolean(payload.pinned, false),
    starred: readBoolean(payload.starred, false),
    content,
    markdown_source: content,
    timestamp: timestampFromValue(payload.created_at),
    subject: topicUuid ?? "",
    ...(topicUuid != null ? { topic_uuid: topicUuid } : {}),
    type: "stream",
    stream_uuid: streamUuid,
    ...(sourceName != null ? { source_name: sourceName } : {}),
    ...(source != null ? { source } : {}),
    flags: [...(read ? ["read"] : []), ...(mentioned ? ["mentioned"] : [])],
    reactions: readMessageReactions(payload.reactions),
    ...(providerDelivery != null ? providerDelivery : {}),
  };
}

function deletedMessageFromWorkspaceEventPayload(
  payload: Record<string, unknown>,
): { id: string; stream_uuid: string; topic_uuid: string } | null {
  const messageUuid = normalizeUuid(payload.uuid);
  const streamUuid = normalizeUuid(payload.stream_uuid);
  const topicUuid = normalizeUuid(payload.topic_uuid);
  if (messageUuid == null || streamUuid == null || topicUuid == null) {
    return null;
  }
  return {
    id: messageUuid,
    stream_uuid: streamUuid,
    topic_uuid: topicUuid,
  };
}

function messagesReadEventFromWorkspacePayload(
  epochVersion: number,
  payloadValue: unknown,
): MessengerEvent | null {
  if (!isRecord(payloadValue)) {
    return null;
  }
  const messageUuids = readStringArray(payloadValue.message_uuids ?? payloadValue.messages);
  if (messageUuids == null) {
    return null;
  }
  return {
    id: epochVersion,
    type: "message",
    epoch_version: epochVersion,
    kind: "messages.read",
    message_uuids: messageUuids,
    message_ids: messageUuids,
  };
}

function userEventFromWorkspaceUser(
  epochVersion: number,
  userValue: unknown,
): MessengerEvent | null {
  const user = parseMessengerGatewayUser(userValue);
  if (user == null) {
    return null;
  }
  return {
    id: epochVersion,
    type: "user",
    epoch_version: epochVersion,
    kind: "user.updated",
    user,
  };
}

type WorkspaceStreamEventKind =
  | "stream.created"
  | "stream.updated"
  | "stream.read"
  | "stream.deleted";

function isWorkspaceStreamEventKind(kind: string | null): kind is WorkspaceStreamEventKind {
  return (
    kind === "stream.created" ||
    kind === "stream.updated" ||
    kind === "stream.read" ||
    kind === "stream.deleted"
  );
}

type WorkspaceTopicEventKind = "topic.created" | "topic.updated" | "topic.read" | "topic.deleted";

function isWorkspaceTopicEventKind(kind: string | null): kind is WorkspaceTopicEventKind {
  return (
    kind === "topic.created" ||
    kind === "topic.updated" ||
    kind === "topic.read" ||
    kind === "topic.deleted"
  );
}

function streamEventFromWorkspaceStream(
  epochVersion: number,
  kind: WorkspaceStreamEventKind,
  streamValue: unknown,
): MessengerEvent | null {
  if (!isRecord(streamValue)) {
    return null;
  }
  const streamUuid = normalizeUuid(streamValue.uuid);
  const name = readString(streamValue.name);
  if (streamUuid == null || (kind === "stream.created" && name == null)) {
    return null;
  }
  const unreadCount = readNonNegativeInteger(streamValue.unread_count);
  const stream: Record<string, unknown> = { ...streamValue, uuid: streamUuid };
  if (name == null) {
    delete stream.name;
  } else {
    stream.name = name;
  }
  delete stream.kind;
  if (unreadCount == null) {
    delete stream.unread_count;
  } else {
    stream.unread_count = unreadCount;
  }
  return {
    id: epochVersion,
    type: "stream",
    epoch_version: epochVersion,
    kind,
    stream,
  };
}

function topicEventFromWorkspaceTopic(
  epochVersion: number,
  kind: WorkspaceTopicEventKind,
  topicValue: unknown,
): MessengerEvent | null {
  if (!isRecord(topicValue)) {
    return null;
  }
  const topicUuid = normalizeUuid(topicValue.uuid);
  const streamUuid = normalizeUuid(topicValue.stream_uuid);
  if (topicUuid == null || streamUuid == null) {
    return null;
  }
  const name = readString(topicValue.name);
  if (kind !== "topic.deleted" && name == null) {
    return null;
  }
  const unreadCount = readNonNegativeInteger(topicValue.unread_count);
  const topic: Record<string, unknown> = {
    ...topicValue,
    uuid: topicUuid,
    stream_uuid: streamUuid,
  };
  delete topic.kind;
  if (name == null) {
    delete topic.name;
  } else {
    topic.name = name;
  }
  if (unreadCount == null) {
    delete topic.unread_count;
  } else {
    topic.unread_count = unreadCount;
  }
  if (typeof topicValue.is_default !== "boolean") {
    delete topic.is_default;
  }
  if (typeof topicValue.is_done !== "boolean") {
    delete topic.is_done;
  }
  return {
    id: epochVersion,
    type: "topic",
    epoch_version: epochVersion,
    kind,
    topic,
  };
}

function streamBindingsEventFromWorkspacePayload(
  epochVersion: number,
  payloadValue: unknown,
): MessengerEvent | null {
  if (!isRecord(payloadValue)) {
    return null;
  }
  const itemsValue = Array.isArray(payloadValue.items)
    ? payloadValue.items
    : payloadValue.stream_bindings;
  if (!Array.isArray(itemsValue)) {
    return null;
  }
  const streamBindings = itemsValue.filter(isRecord).map((binding) => ({ ...binding }));
  const firstBindingStreamUuid = streamBindings
    .map((binding) => normalizeUuid(binding.stream_uuid))
    .find((streamUuid): streamUuid is string => streamUuid != null);
  const streamUuid =
    normalizeUuid(payloadValue.uuid) ??
    normalizeUuid(payloadValue.stream_uuid) ??
    firstBindingStreamUuid;
  if (streamUuid == null || streamBindings.length === 0) {
    return null;
  }
  return {
    id: epochVersion,
    type: "stream_binding",
    epoch_version: epochVersion,
    kind: "stream_bindings.created",
    stream_uuid: streamUuid,
    stream_bindings: streamBindings,
  };
}

function folderEventFromWorkspaceFolder(
  epochVersion: number,
  kind: "folder.created" | "folder.updated",
  folderValue: unknown,
): MessengerEvent | null {
  if (!isRecord(folderValue)) {
    return null;
  }
  const folderUuid = readString(folderValue.uuid);
  if (folderUuid == null) {
    return null;
  }
  const folder: Record<string, unknown> = { ...folderValue, uuid: folderUuid };
  delete folder.kind;
  return {
    id: epochVersion,
    type: "folder",
    epoch_version: epochVersion,
    kind,
    folder,
  };
}

function folderDeletedEventFromWorkspaceFolder(
  epochVersion: number,
  folderValue: unknown,
): MessengerEvent | null {
  if (!isRecord(folderValue)) {
    return null;
  }
  const folderUuid = readString(folderValue.uuid);
  if (folderUuid == null) {
    return null;
  }
  return {
    id: epochVersion,
    type: "folder",
    epoch_version: epochVersion,
    kind: "folder.deleted",
    folder: { uuid: folderUuid },
  };
}

function folderItemDeletedEventFromWorkspaceItem(
  epochVersion: number,
  folderItemValue: unknown,
): MessengerEvent | null {
  if (!isRecord(folderItemValue)) {
    return null;
  }
  const folderItemUuid = readString(folderItemValue.uuid);
  if (folderItemUuid == null) {
    return null;
  }
  return {
    id: epochVersion,
    type: "folder_item",
    epoch_version: epochVersion,
    kind: "folder_item.deleted",
    folder_item: { uuid: folderItemUuid },
  };
}

export function adaptWorkspaceEventForMessenger(row: unknown): AdaptedMessengerEvent | null {
  if (!isRecord(row)) {
    return null;
  }
  const epochVersion = normalizeEpochVersion(row.epoch_version);
  if (epochVersion == null) {
    return null;
  }
  const payload = isRecord(row.payload) ? row.payload : null;
  if (payload == null) {
    return { epochVersion, event: null, skipReason: "missing payload" };
  }
  const kind = readString(payload.kind);
  if (kind === "user.updated") {
    const event = userEventFromWorkspaceUser(epochVersion, payload);
    return event == null
      ? { epochVersion, event: null, skipReason: "invalid user.updated payload" }
      : { epochVersion, event };
  }
  if (kind === "messages.read") {
    const event = messagesReadEventFromWorkspacePayload(epochVersion, payload);
    return event == null
      ? { epochVersion, event: null, skipReason: "invalid messages.read payload" }
      : { epochVersion, event };
  }
  if (kind === "message.created" || kind === "message.updated" || kind === "message.read") {
    const currentUserUuid = normalizeUuid(row.user_uuid);
    const message = messageFromWorkspaceEventPayload(payload, currentUserUuid);
    if (message == null) {
      return { epochVersion, event: null, skipReason: `invalid ${kind} payload` };
    }
    return {
      epochVersion,
      event: {
        id: epochVersion,
        type: "message",
        kind,
        epoch_version: epochVersion,
        message,
      },
    };
  }
  if (kind === "message.deleted") {
    const message = deletedMessageFromWorkspaceEventPayload(payload);
    if (message == null) {
      return { epochVersion, event: null, skipReason: "invalid message.deleted payload" };
    }
    return {
      epochVersion,
      event: {
        id: epochVersion,
        type: "message",
        kind,
        epoch_version: epochVersion,
        message,
        message_id: message.id,
        message_ids: [message.id],
      },
    };
  }
  if (isWorkspaceStreamEventKind(kind)) {
    const event = streamEventFromWorkspaceStream(epochVersion, kind, payload);
    return event == null
      ? { epochVersion, event: null, skipReason: `invalid ${kind} payload` }
      : { epochVersion, event };
  }
  if (isWorkspaceTopicEventKind(kind)) {
    const event = topicEventFromWorkspaceTopic(epochVersion, kind, payload);
    return event == null
      ? { epochVersion, event: null, skipReason: `invalid ${kind} payload` }
      : { epochVersion, event };
  }
  if (kind === "stream_bindings.created") {
    const event = streamBindingsEventFromWorkspacePayload(epochVersion, payload);
    return event == null
      ? { epochVersion, event: null, skipReason: "invalid stream_bindings.created payload" }
      : { epochVersion, event };
  }
  if (kind === "folder.created" || kind === "folder.updated") {
    const event = folderEventFromWorkspaceFolder(epochVersion, kind, payload);
    return event == null
      ? { epochVersion, event: null, skipReason: `invalid ${kind} payload` }
      : { epochVersion, event };
  }
  if (kind === "folder.deleted") {
    const event = folderDeletedEventFromWorkspaceFolder(epochVersion, payload);
    return event == null
      ? { epochVersion, event: null, skipReason: "invalid folder.deleted payload" }
      : { epochVersion, event };
  }
  if (kind === "folder_item.deleted") {
    const event = folderItemDeletedEventFromWorkspaceItem(epochVersion, payload);
    return event == null
      ? { epochVersion, event: null, skipReason: "invalid folder_item.deleted payload" }
      : { epochVersion, event };
  }
  if (kind?.startsWith("mail.") || kind?.startsWith("calendar.")) {
    const type = kind.startsWith("mail.") ? "mail" : "calendar";
    return {
      epochVersion,
      event: {
        id: epochVersion,
        type,
        kind,
        epoch_version: epochVersion,
        resource: payload,
      },
    };
  }
  return {
    epochVersion,
    event: null,
    skipReason: `unsupported payload kind: ${kind ?? "unknown"}`,
  };
}

function parseCanonicalWorkspaceEvent(row: unknown): NormalizedWorkspaceRealtimeEvent | null {
  if (!isRecord(row) || !isRecord(row.payload)) return null;
  const epochVersion = normalizeEpochVersion(row.epoch_version);
  const schemaVersion = normalizeEpochVersion(row.schema_version);
  if (epochVersion != null && schemaVersion != null && schemaVersion !== 1) {
    return {
      epochVersion,
      event: null,
      skipReason: `unsupported schema_version: ${schemaVersion}`,
    };
  }
  const uuid = readString(row.uuid);
  const projectId = readString(row.project_id);
  const userUuid = readString(row.user_uuid);
  const objectType = readWorkspaceEventObjectType(row.object_type);
  const action = readString(row.action);
  const createdAt = readString(row.created_at);
  const updatedAt = readString(row.updated_at);
  const kind = readString(row.payload.kind);
  if (
    epochVersion == null ||
    schemaVersion == null ||
    schemaVersion !== 1 ||
    uuid == null ||
    projectId == null ||
    userUuid == null ||
    objectType == null ||
    action == null ||
    createdAt == null ||
    updatedAt == null ||
    kind == null
  ) {
    return null;
  }
  return {
    epochVersion,
    event: {
      schema_version: schemaVersion,
      uuid,
      epoch_version: epochVersion,
      project_id: projectId,
      user_uuid: userUuid,
      object_type: objectType,
      action,
      created_at: createdAt,
      updated_at: updatedAt,
      payload: { ...row.payload, kind },
    },
  };
}

/** Converts one canonical event to the existing messenger domain projection. */
export function normalizeWorkspaceEventModel(row: unknown): AdaptedMessengerEvent | null {
  return adaptWorkspaceEventForMessenger(row);
}

export function normalizeWorkspaceRealtimeEvent(
  rawEvent: unknown,
  _currentUserUuid: string | null,
): AdaptedMessengerEvent | null {
  const normalized = parseCanonicalWorkspaceEvent(rawEvent);
  if (normalized == null) return null;
  if (normalized.event == null) {
    return {
      epochVersion: normalized.epochVersion,
      event: null,
      ...(normalized.skipReason == null ? {} : { skipReason: normalized.skipReason }),
    };
  }
  return adaptWorkspaceEventForMessenger(normalized.event);
}

function createAbortError(): Error {
  const err = new Error("Aborted");
  err.name = "AbortError";
  return err;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function sleepWithAbort(ms: number, signal: AbortSignal | undefined): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(createAbortError());
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(createAbortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function waitUntilOnlineWithAbort(signal: AbortSignal | undefined): Promise<void> {
  if (isOnline()) {
    return Promise.resolve();
  }
  if (signal?.aborted) {
    return Promise.reject(createAbortError());
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanupFns: (() => void)[] = [];
    const finish = (fn: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      for (const cleanup of cleanupFns) {
        cleanup();
      }
      fn();
    };
    const unsubscribe = onStatusChange((online) => {
      if (online) {
        finish(resolve);
      }
    });
    cleanupFns.push(unsubscribe);
    const onAbort = () => finish(() => reject(createAbortError()));
    signal?.addEventListener("abort", onAbort, { once: true });
    cleanupFns.push(() => signal?.removeEventListener("abort", onAbort));
  });
}

function getReconnectBackoffMs(attempt: number): number {
  return Math.min(MIN_RECONNECT_BACKOFF_MS * Math.pow(1.7, attempt), MAX_RECONNECT_BACKOFF_MS);
}

function shouldDeliverEvent(
  options: StartMessengerEventLoopOptions,
  event: WorkspaceEvent,
): boolean {
  return (
    event.project_id.trim().toLowerCase() === WORKSPACE_PROJECT_UUID &&
    (options.eventTypes == null || options.eventTypes.includes(event.object_type))
  );
}

function advanceStoredEpoch(state: LoopState, epochVersion: number): void {
  state.lastEpochVersion = Math.max(state.lastEpochVersion, epochVersion);
  writeLastEpochVersion(state.storageKey, state.lastEpochVersion);
  writeEpochGeneration(state.storageKey, state.epochGeneration);
}

async function processNormalizedEvent(
  normalized: NormalizedWorkspaceRealtimeEvent,
  options: StartMessengerEventLoopOptions,
  state: LoopState,
  delivery: MessengerEventDeliveryContext,
): Promise<boolean> {
  if (normalized.epochVersion <= state.lastEpochVersion) {
    return false;
  }

  if (normalized.event == null) {
    log.warn("Skipping unsupported realtime event", {
      epochVersion: normalized.epochVersion,
      reason: normalized.skipReason,
    });
    throw new UnsupportedRealtimeEventError(normalized.epochVersion, normalized.skipReason);
  }

  if (!shouldDeliverEvent(options, normalized.event)) {
    log.debug("Skipping realtime event outside configured scope or eventTypes", {
      epochVersion: normalized.epochVersion,
      type: normalized.event.object_type,
    });
    advanceStoredEpoch(state, normalized.epochVersion);
    return true;
  }

  recordDiagnosticRealtimeEvent(normalized.event.object_type);
  logEvent(normalized.event.payload.kind, { epochVersion: normalized.epochVersion });
  await options.onEvent(normalized.event, delivery);
  advanceStoredEpoch(state, normalized.epochVersion);
  return true;
}

async function runCatchUp(
  runtime: RuntimeConfig,
  options: StartMessengerEventLoopOptions,
  state: LoopState,
): Promise<void> {
  for (let page = 0; page < MAX_CATCH_UP_PAGES; page += 1) {
    const rows = await fetchCatchUpBatch(
      runtime,
      state.lastEpochVersion,
      state.epochGeneration,
      options.signal,
    );
    if (rows.length === 0) {
      return;
    }

    const normalizedRows = rows
      .map((row) => parseCanonicalWorkspaceEvent(row))
      .filter((row): row is NormalizedWorkspaceRealtimeEvent => row != null)
      .sort((left, right) => left.epochVersion - right.epochVersion);

    let advanced = false;
    for (const normalized of normalizedRows) {
      advanced =
        (await processNormalizedEvent(normalized, options, state, {
          source: "catchup",
          notificationsAllowed: state.hasCompletedInitialReady,
        })) || advanced;
    }

    if (rows.length < CATCH_UP_PAGE_LIMIT || !advanced) {
      return;
    }
  }

  log.warn("Realtime catch-up page cap reached", {
    pageLimit: CATCH_UP_PAGE_LIMIT,
    maxPages: MAX_CATCH_UP_PAGES,
    lastEpochVersion: state.lastEpochVersion,
  });
}

function parseJsonFrame(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "string") {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function openRealtimeSocket(
  runtime: RuntimeConfig,
  options: StartMessengerEventLoopOptions,
  state: LoopState,
): Promise<SocketCloseInfo> {
  if (typeof WebSocket === "undefined") {
    return Promise.reject(new Error("WebSocket is not available in this runtime"));
  }
  const signal = options.signal;
  if (signal?.aborted) {
    return Promise.reject(createAbortError());
  }

  return new Promise((resolve, reject) => {
    const url = buildRealtimeWebSocketUrl(
      runtime.websocketApiBaseUrl,
      state.lastEpochVersion,
      state.epochGeneration,
    );
    let socket: WebSocket;
    let queueReadySent = false;
    let settled = false;
    let deliveryQueue = Promise.resolve();
    let stopWatchdog: (() => void) | null = null;
    let watchdogProbeInFlight: Promise<void> | null = null;

    const cleanup = () => {
      stopWatchdog?.();
      stopWatchdog = null;
      signal?.removeEventListener("abort", onAbort);
      if (state.socket === socket) {
        state.socket = null;
      }
    };
    const finish = (info: SocketCloseInfo) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(info);
    };
    const fail = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(toError(error));
    };
    const onAbort = () => {
      try {
        socket.close(1000, "aborted");
      } catch {
        /* ignore close failures during abort */
      }
      fail(createAbortError());
    };
    const markQueueReady = () => {
      if (queueReadySent) {
        return;
      }
      queueReadySent = true;
      options.onQueueReady?.();
    };
    const reconnectSocket = (reason: string, resultCode: number = CLIENT_RECONNECT_CLOSE_CODE) => {
      if (settled) {
        return;
      }
      if (socket.readyState < 2) {
        try {
          socket.close(CLIENT_RECONNECT_CLOSE_CODE, reason);
        } catch {
          /* close is best-effort */
        }
      }
      finish({ code: resultCode, reason, wasClean: false });
    };
    const probeRealtimeCursor = () => {
      if (settled || watchdogProbeInFlight != null || !isOnline() || socket.readyState !== 1) {
        return;
      }
      const probe = fetchServerEpochCursor(runtime, signal)
        .then((serverCursor) => {
          if (settled || socket.readyState !== 1) {
            return;
          }
          const generationChanged =
            state.epochGeneration != null && serverCursor.epochGeneration !== state.epochGeneration;
          const socketFellBehind = serverCursor.epochVersion > state.lastEpochVersion;
          if (!generationChanged && !socketFellBehind) {
            return;
          }
          log.warn("Realtime websocket cursor watchdog detected stale delivery", {
            generationChanged,
            lastEpochVersion: state.lastEpochVersion,
            serverEpochVersion: serverCursor.epochVersion,
          });
          reconnectSocket("realtime cursor lag");
        })
        .catch((error: unknown) => {
          if (!settled && !isAbortError(error)) {
            log.debug("Realtime websocket cursor watchdog probe failed", {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        });
      watchdogProbeInFlight = probe;
      void probe.finally(() => {
        if (watchdogProbeInFlight === probe) {
          watchdogProbeInFlight = null;
        }
      });
    };

    try {
      socket = new WebSocket(url, [WORKSPACE_EVENTS_PROTOCOL, `bearer.${runtime.accessToken}`]);
    } catch (error) {
      fail(error);
      return;
    }

    state.socket = socket;
    signal?.addEventListener("abort", onAbort, { once: true });
    stopWatchdog = createResilientInterval(() => {
      probeRealtimeCursor();
    }, REALTIME_WATCHDOG_INTERVAL_MS);

    socket.onopen = () => {
      log.info("Realtime websocket connected", { url: WORKSPACE_REALTIME_WS_PATH });
    };

    socket.onmessage = (messageEvent: MessageEvent) => {
      const frame = parseJsonFrame(messageEvent.data);
      if (frame == null) {
        return;
      }
      if (readString(frame.type) === "ready") {
        void deliveryQueue.then(() => {
          const readyGeneration = readString(frame.epoch_generation);
          const readyVersion = normalizeEpochVersion(frame.epoch_version);
          if (readyGeneration != null) {
            state.epochGeneration = readyGeneration;
          }
          if (readyVersion != null) {
            advanceStoredEpoch(state, readyVersion);
          } else {
            writeEpochGeneration(state.storageKey, state.epochGeneration);
          }
          state.hasCompletedInitialReady = true;
          markQueueReady();
        });
        return;
      }
      const normalized = parseCanonicalWorkspaceEvent(frame);
      if (normalized == null) {
        log.warn("Skipping unsupported realtime websocket frame", {
          frameType: readString(frame.type) ?? "unknown",
        });
        return;
      }
      deliveryQueue = deliveryQueue
        .then(() =>
          processNormalizedEvent(normalized, options, state, {
            source: "realtime",
            notificationsAllowed: state.hasCompletedInitialReady,
          }),
        )
        .then(() => undefined)
        .catch((error: unknown) => {
          log.error("Realtime event handler failed", {
            error: error instanceof Error ? error.message : String(error),
            epochVersion: normalized.epochVersion,
          });
          try {
            socket.close(1011, "event handler failed");
          } catch {
            /* close is best-effort */
          }
          finish({ code: 1011, reason: "event handler failed", wasClean: false });
        });
    };

    socket.onerror = () => {
      log.warn("Realtime websocket error");
      reconnectSocket("websocket transport error", 1006);
    };

    socket.onclose = (event: CloseEvent) => {
      log.info("Realtime websocket closed", {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      });
      if (AUTH_CLOSE_CODES.has(event.code)) {
        fail(new RealtimeAuthStopError(`Realtime websocket unauthorized (${event.code})`));
        return;
      }
      void deliveryQueue.finally(() => {
        finish({ code: event.code, reason: event.reason, wasClean: event.wasClean });
      });
    };
  });
}

type RealtimePassResult = "immediate" | "backoff";

async function runRealtimeConnectionPass(
  runtime: RuntimeConfig,
  options: StartMessengerEventLoopOptions,
  state: LoopState,
): Promise<RealtimePassResult> {
  await runCatchUp(runtime, options, state);
  const socketRuntime = resolveRuntimeConfig(options) ?? runtime;
  const closeInfo = await openRealtimeSocket(socketRuntime, options, state);
  if (closeInfo.code === EVENTS_CURSOR_EXPIRED_CLOSE_CODE) {
    resetRuntimeLastEpochVersion(runtime, state);
    await options.onCursorExpired?.();
    return "immediate";
  }

  const reconnectNow =
    state.forceImmediateReconnect || closeInfo.code === CLIENT_RECONNECT_CLOSE_CODE;
  state.forceImmediateReconnect = false;
  return reconnectNow ? "immediate" : "backoff";
}

function shouldStopRealtimeLoopAfterError(error: unknown): boolean {
  if (error instanceof RealtimeAuthStopError) {
    log.warn("Realtime transport stopped for auth", { error: error.message });
    return true;
  }
  return isAbortError(error);
}

async function initializeLoopState(
  runtime: RuntimeConfig,
  options: StartMessengerEventLoopOptions,
): Promise<LoopState> {
  const serverCursor = await fetchServerEpochCursor(runtime, options.signal);
  let storedVersion = readRuntimeLastEpochVersion(runtime);
  let storedGeneration = readEpochGeneration(runtime.storageKey);
  if (storedVersion > 0 && storedGeneration == null) {
    writeLastEpochVersion(runtime.storageKey, 0);
    storedVersion = 0;
    await options.onCursorExpired?.();
  }
  storedGeneration ??= serverCursor.epochGeneration;
  return {
    epochGeneration: storedGeneration,
    forceImmediateReconnect: false,
    hasCompletedInitialReady: false,
    lastEpochVersion: storedVersion,
    socket: null,
    storageKey: runtime.storageKey,
  };
}

function syncLoopStateWithRuntime(state: LoopState, runtime: RuntimeConfig): void {
  state.storageKey = runtime.storageKey;
  state.lastEpochVersion = Math.max(state.lastEpochVersion, readRuntimeLastEpochVersion(runtime));
  state.epochGeneration ??= readEpochGeneration(runtime.storageKey);
}

async function recoverFromRealtimePassError(
  error: unknown,
  runtime: RuntimeConfig,
  options: StartMessengerEventLoopOptions,
  state: LoopState,
  reconnectAttempt: number,
): Promise<number | null> {
  if (shouldStopRealtimeLoopAfterError(error)) return null;
  if (error instanceof RealtimeHttpError && error.status === 410) {
    resetRuntimeLastEpochVersion(runtime, state);
    await options.onCursorExpired?.();
    return 0;
  }
  const nextAttempt = reconnectAttempt + 1;
  log.warn("Realtime transport reconnect scheduled", {
    attempt: nextAttempt,
    error: error instanceof Error ? error.message : String(error),
  });
  await sleepWithAbort(getReconnectBackoffMs(nextAttempt), options.signal);
  return nextAttempt;
}

async function runRealtimePassLoop(
  options: StartMessengerEventLoopOptions,
  state: LoopState,
): Promise<void> {
  let reconnectAttempt = 0;
  while (!options.signal?.aborted) {
    await waitUntilOnlineWithAbort(options.signal);
    const runtime = resolveRuntimeConfig(options);
    if (runtime == null) {
      log.warn("Realtime transport paused without IAM credentials");
      return;
    }
    syncLoopStateWithRuntime(state, runtime);
    try {
      const passResult = await runRealtimeConnectionPass(runtime, options, state);
      if (options.signal?.aborted) return;
      reconnectAttempt = passResult === "immediate" ? 0 : reconnectAttempt + 1;
      if (passResult === "backoff") {
        await sleepWithAbort(getReconnectBackoffMs(reconnectAttempt), options.signal);
      }
    } catch (error) {
      const nextAttempt = await recoverFromRealtimePassError(
        error,
        runtime,
        options,
        state,
        reconnectAttempt,
      );
      if (nextAttempt == null) return;
      reconnectAttempt = nextAttempt;
    }
  }
}

function closeLoopSocket(state: LoopState): void {
  const socket = state.socket;
  if (socket != null && socket.readyState < 2) socket.close(1000, "stopped");
}

async function runWorkspaceRealtimeLoop(options: StartMessengerEventLoopOptions): Promise<void> {
  const initialRuntime = resolveRuntimeConfig(options);
  if (initialRuntime == null) {
    log.warn("Realtime transport not started without IAM credentials");
    return;
  }

  const state = await initializeLoopState(initialRuntime, options);

  const closeForReconnect = (code: number, reason: string) => {
    state.forceImmediateReconnect = true;
    const socket = state.socket;
    if (socket == null || socket.readyState >= 2) {
      return;
    }
    try {
      socket.close(code, reason);
    } catch {
      /* close is best-effort */
    }
  };

  const teardownLifecycle = attachEventLoopLifecycle({
    onTabResume: (hiddenDurationMs) => {
      options.onTabStaleResume?.(hiddenDurationMs);
      closeForReconnect(CLIENT_RECONNECT_CLOSE_CODE, "tab resumed");
    },
    onReconnect: () => closeForReconnect(CLIENT_RECONNECT_CLOSE_CODE, "network reconnected"),
    onOnline: () => closeForReconnect(CLIENT_RECONNECT_CLOSE_CODE, "network online"),
    onOffline: () => closeForReconnect(CLIENT_OFFLINE_CLOSE_CODE, "network offline"),
  });

  try {
    await runRealtimePassLoop(options, state);
  } finally {
    teardownLifecycle();
    closeLoopSocket(state);
  }
}

export function startMessengerEventLoop(options: StartMessengerEventLoopOptions): void {
  if (options.enabled === false) {
    log.info("Workspace realtime transport disabled by caller");
    return;
  }
  void runWorkspaceRealtimeLoop(options).catch((error) => {
    if (!isAbortError(error)) {
      log.error("Unhandled realtime transport failure", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

export function startMessengerEventLoopForCredentials(
  options: StartMessengerEventLoopForCredentialsOptions,
): void {
  startMessengerEventLoop(options);
}
