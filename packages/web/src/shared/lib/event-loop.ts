/** Workspace realtime transport: REST epoch catch-up followed by WebSocket live events. */
import {
  getCurrentInstance,
  getMessengerGatewayApiBaseForCurrentInstance,
  messengerApi,
} from "~/shared/api/client";
import type {
  MessengerCredentials,
  MessengerEvent,
  WorkspaceRawMessage,
} from "~/shared/api/messenger.types";
import { MESSENGER_API_PATH } from "~/shared/config/workspace-api-layout";
import { recordDiagnosticRealtimeEvent } from "~/shared/lib/diagnostics-realtime.lib";
import { attachEventLoopLifecycle } from "~/shared/lib/event-loop-lifecycle.lib";
import { resolveIamAccessToken, resolveIamApiOrigin } from "~/shared/lib/iam-instance.lib";
import { createLogger, logEvent } from "~/shared/lib/logger";
import { isOnline, onStatusChange } from "~/shared/lib/network";

const log = createLogger("realtime");

const WORKSPACE_EVENTS_PROTOCOL = "workspace.events.v1";
const WORKSPACE_REALTIME_WS_PATH = "/api/messenger/ws";
const WORKSPACE_EVENTS_PATH = "/events/";
const REALTIME_STORAGE_PREFIX = "workspace-realtime:last-epoch:v1:";
const CATCH_UP_PAGE_LIMIT = 500;
const MAX_CATCH_UP_PAGES = 20;
const MIN_RECONNECT_BACKOFF_MS = 1_000;
const MAX_RECONNECT_BACKOFF_MS = 30_000;
const CLIENT_RECONNECT_CLOSE_CODE = 4000;
const CLIENT_OFFLINE_CLOSE_CODE = 4001;
const AUTH_CLOSE_CODES = new Set([4401, 4403]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface StartMessengerEventLoopOptions {
  enabled?: boolean;
  onEvent: (event: MessengerEvent) => void;
  onBadQueue?: () => void;
  onQueueReady?: () => void;
  onTabStaleResume?: (hiddenDurationMs: number) => void;
  instanceId?: string;
  signal?: AbortSignal;
  eventTypes?: string[];
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
  currentUserUuid: string | null;
  forceImmediateReconnect: boolean;
  lastEpochVersion: number;
  socket: WebSocket | null;
  storageKey: string;
}

export interface NormalizedWorkspaceRealtimeEvent {
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

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
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

function buildRealtimeWebSocketUrl(messengerApiBaseUrl: string, lastEpochVersion: number): string {
  const baseUrl = new URL(resolveHttpBaseUrl(messengerApiBaseUrl));
  const url = new URL(WORKSPACE_REALTIME_WS_PATH, `${baseUrl.origin}/`);
  url.protocol = baseUrl.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("last_epoch_version", String(lastEpochVersion));
  return url.toString();
}

function resolveRuntimeConfig(options: StartMessengerEventLoopOptions): RuntimeConfig | null {
  if (hasCredentials(options)) {
    const accessToken = options.credentials.accessToken.trim();
    const origin = resolveIamApiOrigin(options.credentials).replace(/\/+$/, "");
    if (accessToken.length === 0 || origin.length === 0) {
      return null;
    }
    const identity =
      options.instanceId ?? `${options.credentials.realm}|${options.credentials.login}`;
    return {
      accessToken,
      fetchMode: "direct",
      messengerApiBaseUrl: `${origin}${MESSENGER_API_PATH}`,
      storageKey: buildStorageKey(identity),
      websocketApiBaseUrl: `${origin}${MESSENGER_API_PATH}`,
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
  const identity = options.instanceId ?? instance.id ?? `${instance.realm}|${instance.login}`;
  const websocketOrigin = resolveIamApiOrigin(instance).replace(/\/+$/, "");
  const messengerApiBaseUrl = getMessengerGatewayApiBaseForCurrentInstance();
  return {
    accessToken,
    fetchMode: "active-client",
    messengerApiBaseUrl,
    storageKey: buildStorageKey(identity),
    websocketApiBaseUrl:
      websocketOrigin.length > 0 ? `${websocketOrigin}${MESSENGER_API_PATH}` : messengerApiBaseUrl,
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
  signal: AbortSignal | undefined,
): Promise<unknown[]> {
  const params = {
    "epoch_version>": String(afterEpochVersion),
    page_limit: String(CATCH_UP_PAGE_LIMIT),
  };

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
    flags: read ? ["read"] : [],
    reactions: [],
  };
}

type WorkspaceStreamEventKind = "stream.created" | "stream.updated";

function isWorkspaceStreamEventKind(kind: string | null): kind is WorkspaceStreamEventKind {
  return kind === "stream.created" || kind === "stream.updated";
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

function streamBindingsEventFromWorkspacePayload(
  epochVersion: number,
  payloadValue: unknown,
): MessengerEvent | null {
  if (!isRecord(payloadValue)) {
    return null;
  }
  const streamUuid = normalizeUuid(payloadValue.stream_uuid);
  if (streamUuid == null || !Array.isArray(payloadValue.stream_bindings)) {
    return null;
  }
  const streamBindings = payloadValue.stream_bindings
    .filter(isRecord)
    .map((binding) => ({ ...binding }));
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

export function normalizeWorkspaceEventModel(
  row: unknown,
): NormalizedWorkspaceRealtimeEvent | null {
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
  if (kind === "message.created") {
    const currentUserUuid = normalizeUuid(row.user_uuid);
    const message = messageFromWorkspaceEventPayload(payload, currentUserUuid);
    if (message == null) {
      return { epochVersion, event: null, skipReason: "invalid message.created payload" };
    }
    return {
      epochVersion,
      event: {
        id: epochVersion,
        type: "message",
        epoch_version: epochVersion,
        message,
      },
    };
  }
  if (isWorkspaceStreamEventKind(kind)) {
    const event = streamEventFromWorkspaceStream(epochVersion, kind, payload);
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
  return {
    epochVersion,
    event: null,
    skipReason: `unsupported payload kind: ${kind ?? "unknown"}`,
  };
}

function messageFromRealtimeFrame(
  messageValue: unknown,
  currentUserUuid: string | null,
): WorkspaceRawMessage | null {
  if (!isRecord(messageValue)) {
    return null;
  }
  const markdownPayload = isRecord(messageValue.payload) ? messageValue.payload : null;
  const messageUuid =
    normalizeUuid(messageValue.id) ??
    normalizeUuid(messageValue.uuid) ??
    normalizeUuid(messageValue.source_message_uuid);
  const streamUuid = normalizeUuid(messageValue.stream_uuid);
  const authorUuid =
    normalizeUuid(messageValue.author_uuid) ?? normalizeUuid(messageValue.sender_uuid);
  const content =
    readOptionalString(messageValue.content) ??
    readOptionalString(messageValue.markdown_source) ??
    readOptionalString(markdownPayload?.content);
  if (messageUuid == null || streamUuid == null || authorUuid == null || content == null) {
    return null;
  }
  const topicUuid = normalizeUuid(messageValue.topic_uuid);
  const isOwn = readBoolean(messageValue.is_own, userUuidsEqual(authorUuid, currentUserUuid));
  const read = readBoolean(messageValue.read, isOwn);
  const senderId = typeof messageValue.sender_id === "number" ? messageValue.sender_id : 0;
  const subject = readOptionalString(messageValue.subject) ?? topicUuid ?? "";
  return {
    id: messageUuid,
    source_message_uuid: normalizeUuid(messageValue.source_message_uuid) ?? messageUuid,
    sender_id: senderId,
    author_uuid: authorUuid,
    sender_uuid: normalizeUuid(messageValue.sender_uuid) ?? authorUuid,
    is_own: isOwn,
    read,
    pinned: readBoolean(messageValue.pinned, false),
    starred: readBoolean(messageValue.starred, false),
    sender_full_name: readOptionalString(messageValue.sender_full_name) ?? "",
    content,
    markdown_source: readOptionalString(messageValue.markdown_source) ?? content,
    timestamp: timestampFromValue(
      messageValue.timestamp ?? messageValue.created_at ?? messageValue.updated_at,
    ),
    ...(typeof messageValue.display_recipient === "string"
      ? { display_recipient: messageValue.display_recipient }
      : {}),
    subject,
    ...(topicUuid != null ? { topic_uuid: topicUuid } : {}),
    type: readOptionalString(messageValue.type) ?? "stream",
    stream_uuid: streamUuid,
    flags: readStringArray(messageValue.flags) ?? (read ? ["read"] : []),
    reactions: [],
  };
}

export function normalizeWorkspaceRealtimeEvent(
  rawEvent: unknown,
  currentUserUuid: string | null,
): NormalizedWorkspaceRealtimeEvent | null {
  if (!isRecord(rawEvent)) {
    return null;
  }
  const epochVersion = normalizeEpochVersion(rawEvent.epoch_version ?? rawEvent.id);
  if (epochVersion == null) {
    return null;
  }
  const type = readString(rawEvent.type);
  if (type === "stream") {
    const kind = readString(rawEvent.kind);
    if (!isWorkspaceStreamEventKind(kind)) {
      return {
        epochVersion,
        event: null,
        skipReason: `unsupported stream event kind: ${kind ?? "unknown"}`,
      };
    }
    const event = streamEventFromWorkspaceStream(epochVersion, kind, rawEvent.stream);
    return event == null
      ? { epochVersion, event: null, skipReason: `invalid ${kind} frame` }
      : { epochVersion, event };
  }
  if (type === "stream_binding") {
    const kind = readString(rawEvent.kind);
    if (kind !== "stream_bindings.created") {
      return {
        epochVersion,
        event: null,
        skipReason: `unsupported stream_binding event kind: ${kind ?? "unknown"}`,
      };
    }
    const event = streamBindingsEventFromWorkspacePayload(epochVersion, rawEvent);
    return event == null
      ? { epochVersion, event: null, skipReason: "invalid stream_bindings.created frame" }
      : { epochVersion, event };
  }
  if (type === "folder") {
    const kind = readString(rawEvent.kind);
    if (kind === "folder.created" || kind === "folder.updated") {
      const event = folderEventFromWorkspaceFolder(epochVersion, kind, rawEvent.folder);
      return event == null
        ? { epochVersion, event: null, skipReason: `invalid ${kind} frame` }
        : { epochVersion, event };
    }
    if (kind === "folder.deleted") {
      const event = folderDeletedEventFromWorkspaceFolder(epochVersion, rawEvent.folder);
      return event == null
        ? { epochVersion, event: null, skipReason: "invalid folder.deleted frame" }
        : { epochVersion, event };
    }
    return {
      epochVersion,
      event: null,
      skipReason: `unsupported folder event kind: ${kind ?? "unknown"}`,
    };
  }
  if (type === "folder_item") {
    const kind = readString(rawEvent.kind);
    if (kind !== "folder_item.deleted") {
      return {
        epochVersion,
        event: null,
        skipReason: `unsupported folder_item event kind: ${kind ?? "unknown"}`,
      };
    }
    const event = folderItemDeletedEventFromWorkspaceItem(epochVersion, rawEvent.folder_item);
    return event == null
      ? { epochVersion, event: null, skipReason: "invalid folder_item.deleted frame" }
      : { epochVersion, event };
  }
  if (type !== "message") {
    return {
      epochVersion,
      event: null,
      skipReason: `unsupported event type: ${type ?? "unknown"}`,
    };
  }
  const message = messageFromRealtimeFrame(rawEvent.message, currentUserUuid);
  if (message == null) {
    return { epochVersion, event: null, skipReason: "invalid message frame" };
  }
  return {
    epochVersion,
    event: {
      id: epochVersion,
      type: "message",
      epoch_version: epochVersion,
      message,
    },
  };
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
  event: MessengerEvent,
): boolean {
  return options.eventTypes == null || options.eventTypes.includes(event.type);
}

function advanceStoredEpoch(state: LoopState, epochVersion: number): void {
  state.lastEpochVersion = Math.max(state.lastEpochVersion, epochVersion);
  writeLastEpochVersion(state.storageKey, state.lastEpochVersion);
}

function processNormalizedEvent(
  normalized: NormalizedWorkspaceRealtimeEvent,
  options: StartMessengerEventLoopOptions,
  state: LoopState,
): boolean {
  if (normalized.epochVersion <= state.lastEpochVersion) {
    return false;
  }

  if (normalized.event == null) {
    log.warn("Skipping unsupported realtime event", {
      epochVersion: normalized.epochVersion,
      reason: normalized.skipReason,
    });
    advanceStoredEpoch(state, normalized.epochVersion);
    return true;
  }

  if (!shouldDeliverEvent(options, normalized.event)) {
    log.debug("Skipping realtime event excluded by eventTypes", {
      epochVersion: normalized.epochVersion,
      type: normalized.event.type,
    });
    advanceStoredEpoch(state, normalized.epochVersion);
    return true;
  }

  recordDiagnosticRealtimeEvent(normalized.event.type);
  logEvent(normalized.event.type, { epochVersion: normalized.epochVersion });
  options.onEvent(normalized.event);
  advanceStoredEpoch(state, normalized.epochVersion);
  return true;
}

async function runCatchUp(
  runtime: RuntimeConfig,
  options: StartMessengerEventLoopOptions,
  state: LoopState,
): Promise<void> {
  for (let page = 0; page < MAX_CATCH_UP_PAGES; page += 1) {
    const rows = await fetchCatchUpBatch(runtime, state.lastEpochVersion, options.signal);
    if (rows.length === 0) {
      return;
    }

    const normalizedRows = rows
      .map((row) => normalizeWorkspaceEventModel(row))
      .filter((row): row is NormalizedWorkspaceRealtimeEvent => row != null)
      .sort((left, right) => left.epochVersion - right.epochVersion);

    let advanced = false;
    for (const normalized of normalizedRows) {
      advanced = processNormalizedEvent(normalized, options, state) || advanced;
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

function sendAck(socket: WebSocket, epochVersion: number): void {
  if (socket.readyState !== 1) {
    return;
  }
  socket.send(JSON.stringify({ type: "ack", epoch_version: epochVersion }));
}

function sendPong(socket: WebSocket, frame: Record<string, unknown>): void {
  if (socket.readyState !== 1) {
    return;
  }
  const ts = readString(frame.ts);
  socket.send(JSON.stringify(ts == null ? { type: "pong" } : { type: "pong", ts }));
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
    const url = buildRealtimeWebSocketUrl(runtime.websocketApiBaseUrl, state.lastEpochVersion);
    let socket: WebSocket;
    let settled = false;

    const cleanup = () => {
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

    try {
      socket = new WebSocket(url, [WORKSPACE_EVENTS_PROTOCOL, `bearer.${runtime.accessToken}`]);
    } catch (error) {
      fail(error);
      return;
    }

    state.socket = socket;
    signal?.addEventListener("abort", onAbort, { once: true });

    socket.onopen = () => {
      log.info("Realtime websocket connected", { url: WORKSPACE_REALTIME_WS_PATH });
    };

    socket.onmessage = (messageEvent: MessageEvent) => {
      const frame = parseJsonFrame(messageEvent.data);
      if (frame == null) {
        return;
      }
      const frameType = readString(frame.type);
      if (frameType === "hello") {
        state.currentUserUuid = normalizeUuid(frame.user_uuid) ?? state.currentUserUuid;
        options.onQueueReady?.();
        return;
      }
      if (frameType === "ping") {
        sendPong(socket, frame);
        return;
      }
      if (frameType !== "event") {
        log.warn("Skipping unsupported realtime websocket frame", { frameType });
        return;
      }
      const normalized = normalizeWorkspaceRealtimeEvent(frame.event, state.currentUserUuid);
      if (normalized == null) {
        return;
      }
      try {
        if (processNormalizedEvent(normalized, options, state)) {
          sendAck(socket, normalized.epochVersion);
        }
      } catch (error) {
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
      }
    };

    socket.onerror = () => {
      log.warn("Realtime websocket error");
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
      finish({ code: event.code, reason: event.reason, wasClean: event.wasClean });
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
  options.onBadQueue?.();

  const reconnectNow =
    state.forceImmediateReconnect || closeInfo.code === CLIENT_RECONNECT_CLOSE_CODE;
  state.forceImmediateReconnect = false;
  return reconnectNow ? "immediate" : "backoff";
}

function shouldStopRealtimeLoopAfterError(
  error: unknown,
  options: StartMessengerEventLoopOptions,
): boolean {
  if (error instanceof RealtimeAuthStopError) {
    log.warn("Realtime transport stopped for auth", { error: error.message });
    options.onBadQueue?.();
    return true;
  }
  return isAbortError(error);
}

async function runWorkspaceRealtimeLoop(options: StartMessengerEventLoopOptions): Promise<void> {
  const initialRuntime = resolveRuntimeConfig(options);
  if (initialRuntime == null) {
    log.warn("Realtime transport not started without IAM credentials");
    return;
  }

  const state: LoopState = {
    currentUserUuid: null,
    forceImmediateReconnect: false,
    lastEpochVersion: readLastEpochVersion(initialRuntime.storageKey),
    socket: null,
    storageKey: initialRuntime.storageKey,
  };

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

  let reconnectAttempt = 0;
  try {
    while (!options.signal?.aborted) {
      await waitUntilOnlineWithAbort(options.signal);
      const runtime = resolveRuntimeConfig(options);
      if (runtime == null) {
        log.warn("Realtime transport paused without IAM credentials");
        return;
      }

      state.storageKey = runtime.storageKey;
      state.lastEpochVersion = Math.max(
        state.lastEpochVersion,
        readLastEpochVersion(runtime.storageKey),
      );

      try {
        const passResult = await runRealtimeConnectionPass(runtime, options, state);
        if (options.signal?.aborted) {
          return;
        }
        reconnectAttempt = passResult === "immediate" ? 0 : reconnectAttempt + 1;
        if (passResult === "backoff") {
          await sleepWithAbort(getReconnectBackoffMs(reconnectAttempt), options.signal);
        }
      } catch (error) {
        if (shouldStopRealtimeLoopAfterError(error, options)) {
          return;
        }
        reconnectAttempt += 1;
        log.warn("Realtime transport reconnect scheduled", {
          attempt: reconnectAttempt,
          error: error instanceof Error ? error.message : String(error),
        });
        options.onBadQueue?.();
        await sleepWithAbort(getReconnectBackoffMs(reconnectAttempt), options.signal);
      }
    }
  } finally {
    teardownLifecycle();
    const socket = state.socket;
    if (socket != null && socket.readyState < 2) {
      socket.close(1000, "stopped");
    }
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
