// Основной API-слой для работы с Zulip (очереди, unread, сообщения, флаги, профили и т.д.).
/**
 * Zulip API client (via zulip-js).
 *
 * Uses the currently selected instance from instancesStore.
 * Client is cached per instanceId to avoid redundant handshakes.
 * Supports both Basic auth (email:apiKey) and cookie session auth.
 *
 * Usage:
 *   import { fetchStreams, fetchMessages, sendMessage, registerQueue } from "~/shared/api/zulip";
 */
import { Buffer } from "buffer";
import zulipInitDefault from "zulip-js";
import { t } from "~/i18n/i18n";
import { getBasicAuthValue } from "~/shared/lib/auth-guard";
import { env } from "~/shared/lib/env";
import { guard, invariant } from "~/shared/lib/guards";
import {
  logChatListFlow,
  summarizeZulipMessagesForFlowDebug,
} from "~/shared/lib/message-flow-debug.lib";
import { toResolvedTopicName, toUnresolvedTopicName } from "~/shared/lib/topic-resolve";
import { isValidEmail, isValidRealmUrl, validateFileUpload } from "~/shared/lib/validation";
import {
  ZULIP_DM_CHAT_NUM_AFTER,
  ZULIP_DM_CHAT_NUM_BEFORE,
  ZULIP_STREAM_CHAT_NUM_AFTER,
  ZULIP_STREAM_CHAT_NUM_BEFORE,
} from "~/shared/lib/zulip-message-window.lib";
import { getCurrentInstance, refreshWorkspaceApiBase, refreshZulipApiBase, zulipApi } from "./client";
import { mockMessageFromGetMessageApiData, rawMessageToMockMessage } from "./zulip-message-map.lib";
import { parseServerThumbnailFormats } from "./zulip-register-metadata.lib";
import { parseUnreadMessagesCount } from "./zulip-unread.lib";

if (typeof (globalThis as unknown as { Buffer?: unknown }).Buffer === "undefined") {
  (globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
}

const zulipInit = zulipInitDefault as unknown as (config: {
  realm: string;
  username: string;
  apiKey: string;
}) => Promise<{
  streams: {
    retrieve: (
      params?: Record<string, unknown>,
    ) => Promise<{ streams?: { stream_id: number; name: string; description?: string }[] }>;
    topics: {
      retrieve: (params: { stream_id: number }) => Promise<{ topics?: { name: string }[] }>;
    };
  };
  messages: {
    retrieve: (params: {
      narrow?: { operator: string; operand: string | number | number[] }[];
      anchor?: string | number;
      num_before?: number;
      num_after?: number;
      include_anchor?: boolean;
      client_gravatar?: boolean;
      allow_empty_topic_name?: boolean;
      apply_markdown?: boolean;
    }) => Promise<{
      messages?: {
        id: number;
        sender_id: number;
        sender_full_name?: string;
        content: string;
        timestamp: number;
        display_recipient?: string;
        subject?: string;
        type?: string;
        stream_id?: number | null;
      }[];
    }>;
    send: (params: {
      type: string;
      to: string | number[];
      topic?: string;
      content: string;
    }) => Promise<{ id?: number }>;
  };
}>;

type ZulipClient = Awaited<ReturnType<typeof zulipInit>>;

let clientCache: { instanceId: string; promise: Promise<ZulipClient> } | null = null;

const TUS_VERSION = "1.0.0";
const TUS_UPLOAD_THRESHOLD_BYTES = 15 * 1024 * 1024;
const TUS_CHUNK_SIZE_BYTES = 5 * 1024 * 1024;

type SessionAuthInstance = NonNullable<ReturnType<typeof getCurrentInstance>> & {
  authType: "session";
};

function isSessionAuthInstance(
  instance: ReturnType<typeof getCurrentInstance>,
): instance is SessionAuthInstance {
  return instance?.authType === "session";
}

function buildMessagesQueryParams(params: {
  narrow?: unknown;
  anchor?: string | number;
  num_before?: number;
  num_after?: number;
}): Record<string, string> {
  const query: Record<string, string> = {
    anchor: String(params.anchor ?? "newest"),
    num_before: String(params.num_before ?? 100),
    num_after: String(params.num_after ?? 0),
    allow_empty_topic_name: "true",
    client_gravatar: "true",
    apply_markdown: "false",
  };
  if (params.narrow != null) {
    query.narrow = JSON.stringify(params.narrow);
  }
  return query;
}

function createSessionClient(): Promise<ZulipClient> {
  const sessionClient: ZulipClient = {
    streams: {
      retrieve: async () => {
        const res = await zulipPipelineGet("/streams");
        if (!res?.ok) {
          return { streams: [] };
        }
        const data = res.data as {
          result?: string;
          streams?: { stream_id: number; name: string; description?: string }[];
        };
        if (data.result === "error") {
          return { streams: [] };
        }
        return {
          streams: data.streams ?? [],
        };
      },
      topics: {
        retrieve: async (params: { stream_id: number }) => {
          const res = await zulipPipelineGet(`/users/me/${params.stream_id}/topics`);
          if (!res?.ok) {
            return { topics: [] };
          }
          const data = res.data as {
            result?: string;
            topics?: { name?: string }[];
          };
          if (data.result === "error") {
            return { topics: [] };
          }
          return {
            topics: (data.topics ?? []).map((topic) => ({ name: topic.name ?? "" })),
          };
        },
      },
    },
    messages: {
      retrieve: async (params) => {
        const res = await zulipPipelineGet("/messages", buildMessagesQueryParams(params));
        if (!res?.ok) {
          return { result: "error", messages: [] };
        }
        const data = res.data as {
          result?: string;
          messages?: {
            id: number;
            sender_id: number;
            sender_full_name?: string;
            content: string;
            timestamp: number;
            display_recipient?: string;
            subject?: string;
            type?: string;
            stream_id?: number | null;
          }[];
        };
        return {
          result: data.result,
          messages: data.messages ?? [],
        };
      },
      send: async (params) => {
        const body: Record<string, string> = {
          type: params.type,
          content: params.content,
        };
        if (params.type === "private") {
          const recipients = Array.isArray(params.to) ? params.to : [params.to];
          body.to = JSON.stringify(recipients);
        } else {
          body.to = String(params.to);
          if (params.topic != null) {
            body.topic = params.topic;
          }
        }
        const response = await zulipPipelinePost("/messages", body);
        const data = response.data as {
          result?: string;
          msg?: string;
          id?: number;
        };
        if (!response.ok || data.result === "error") {
          throw new Error(data.msg ?? t("app.unknownError"));
        }
        return { id: data.id };
      },
    },
  };
  return Promise.resolve(sessionClient);
}

function getClient(): Promise<ZulipClient> {
  const instance = getCurrentInstance();
  if (!instance) {
    return Promise.reject(new Error(t("app.noInstance")));
  }
  if (clientCache?.instanceId === instance.id) {
    return clientCache.promise;
  }
  if (isSessionAuthInstance(instance)) {
    const promise = createSessionClient();
    clientCache = { instanceId: instance.id, promise };
    return promise;
  }
  const realm = instance.realm.replace(/\/api\/v1$/, "").replace(/\/+$/, "") || instance.realm;
  const promise = zulipInit({
    realm,
    username: instance.email,
    apiKey: instance.apiKey,
  });
  clientCache = { instanceId: instance.id, promise };
  return promise;
}

/** Realm base URL without API path — used for absolute URLs (avatars, uploads). */
export function getRealmBaseUrl(): string {
  const instance = getCurrentInstance();
  if (!instance) return "";
  return normalizeRealm(instance.realm);
}

// --- Auth & current user (Zulip API) ---

export class ZulipAuthError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly response?: unknown,
  ) {
    super(message);
    this.name = "ZulipAuthError";
  }
}

interface FetchApiKeyResult {
  api_key: string;
  email: string;
  user_id: number;
}

export interface DesktopFlowExchangeResult {
  authType: "api_key" | "session";
  email: string;
  apiKey?: string;
}

export interface ZulipUserTopic {
  stream_id: number;
  topic_name: string;
  visibility_policy: number;
}

export interface ZulipRecentPrivateConversation {
  // Что делает: список участников DM (включая текущего пользователя).
  user_ids: number[];
  // Что делает: id последнего сообщения в этом DM, если сервер его знает.
  max_message_id: number | null;
  // Что делает: список непрочитанных сообщений в DM для быстрого unread-индикатора.
  unread_message_ids: number[];
}

export interface SavedSnippet {
  id: number;
  title: string;
  content: string;
  date_created: number;
}

function normalizeRealm(realm: string): string {
  let r = realm.trim().replace(/\/+$/, "");
  const apiPath = env.ZULIP_API_PATH;
  if (r.endsWith(apiPath)) {
    r = r.slice(0, -apiPath.length);
  } else if (r.endsWith("/api/v1")) {
    r = r.slice(0, -"/api/v1".length);
  } else if (r.endsWith("/api")) {
    r = r.slice(0, -"/api".length);
  }
  return r.replace(/\/+$/, "");
}

const userTopicsByInstance = new Map<string, ZulipUserTopic[]>();

function buildUserTopicsCacheKey(realm: string, email: string): string {
  return `${normalizeRealm(realm).toLowerCase()}::${email.trim().toLowerCase()}`;
}

function setCachedUserTopicsForKey(cacheKey: string, topics: ZulipUserTopic[]): void {
  userTopicsByInstance.set(cacheKey, [...topics]);
}

function getCurrentUserTopicsCacheKey(): string | null {
  const instance = getCurrentInstance();
  if (!instance) {
    return null;
  }
  return buildUserTopicsCacheKey(instance.realm, instance.email);
}

function isZulipUserTopic(value: unknown): value is ZulipUserTopic {
  if (typeof value !== "object" || value == null) {
    return false;
  }
  const data = value as Record<string, unknown>;
  return (
    typeof data.stream_id === "number" &&
    typeof data.topic_name === "string" &&
    typeof data.visibility_policy === "number"
  );
}

function parseUserTopics(data: unknown): ZulipUserTopic[] | null {
  if (!Array.isArray(data)) {
    return null;
  }
  return data.filter(isZulipUserTopic);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

// Что делает: безопасно читает recent_private_conversations из register-ответа и отфильтровывает битые данные.
function parseRecentPrivateConversations(
  data: unknown,
): Record<string, ZulipRecentPrivateConversation> | null {
  if (data == null || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }

  const entries = Object.entries(data as Record<string, unknown>);
  if (entries.length === 0) {
    return {};
  }

  const parsed: Record<string, ZulipRecentPrivateConversation> = {};
  for (const [key, value] of entries) {
    if (value == null || typeof value !== "object" || Array.isArray(value)) continue;
    const record = value as Record<string, unknown>;
    if (!Array.isArray(record.user_ids)) continue;
    const userIds = record.user_ids.filter(isPositiveInteger);
    if (userIds.length === 0) continue;
    const unreadMessageIds = Array.isArray(record.unread_message_ids)
      ? record.unread_message_ids.filter(isPositiveInteger)
      : [];
    const maxMessageId = isPositiveInteger(record.max_message_id) ? record.max_message_id : null;
    parsed[key] = {
      user_ids: Array.from(new Set(userIds)).sort((left, right) => left - right),
      max_message_id: maxMessageId,
      unread_message_ids: unreadMessageIds,
    };
  }

  return parsed;
}

/**
 * Fetches server settings (GET /api/v1/server_settings). No auth required.
 * Used on login page to show realm icon, name, and auth methods.
 */
export async function fetchServerSettings(realmUrl: string): Promise<{
  realm_name: string;
  realm_icon: string;
  external_authentication_methods: {
    name: string;
    display_name: string;
    display_icon?: string;
    login_url: string;
  }[];
} | null> {
  try {
    if (!isValidRealmUrl(realmUrl)) {
      return null;
    }
    const parsedRealm = new URL(realmUrl.trim());
    const normalizedPath = parsedRealm.pathname
      .replace(/\/+$/, "")
      .replace(/\/api\/v1$/, "")
      .replace(/\/api$/, "");
    const base = `${parsedRealm.origin}${normalizedPath}`.replace(/\/+$/, "");
    if (!base) return null;
    const url = `${base}${env.ZULIP_API_PATH}/server_settings`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      realm_name?: string;
      realm_icon?: string;
      external_authentication_methods?: {
        name?: string;
        display_name?: string;
        display_icon?: string;
        login_url?: string;
      }[];
    };
    return {
      realm_name: data.realm_name ?? "",
      realm_icon: data.realm_icon ?? "",
      external_authentication_methods: Array.isArray(data.external_authentication_methods)
        ? data.external_authentication_methods.map((m) => ({
            name: m.name ?? "",
            display_name: m.display_name ?? "",
            display_icon: m.display_icon,
            login_url: m.login_url ?? "",
          }))
        : [],
    };
  } catch {
    return null;
  }
}

/**
 * Exchanges credentials for an API key (POST /api/v1/fetch_api_key).
 * Used at login; password is never persisted.
 * @throws ZulipAuthError on auth or network failure
 */
export async function fetchApiKey(
  realm: string,
  username: string,
  password: string,
): Promise<FetchApiKeyResult> {
  const base = normalizeRealm(realm);
  const url = `${base}${env.ZULIP_API_PATH}/fetch_api_key`;
  const body = new URLSearchParams({
    username: username.trim(),
    password,
  }).toString();

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : t("app.networkError");
    throw new ZulipAuthError(t("app.connectFailed", { message }));
  }

  let data: {
    result?: string;
    msg?: string;
    code?: string;
    api_key?: string;
    email?: string;
    user_id?: number;
  };
  try {
    data = (await res.json()) as typeof data;
  } catch {
    throw new ZulipAuthError(t("app.invalidResponse"));
  }

  if (data.result === "success" && data.api_key && data.email != null) {
    return {
      api_key: data.api_key,
      email: data.email,
      user_id: data.user_id ?? 0,
    };
  }

  const msg =
    data.msg ??
    (res.ok ? t("app.unknownError") : t("app.errorStatus", { status: String(res.status) }));
  throw new ZulipAuthError(msg || t("auth.invalidLogin"), data.code, data);
}

function normalizeExchangeCredentials(payload: unknown): { email: string; apiKey: string } | null {
  if (typeof payload !== "object" || payload == null) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const email = typeof record.email === "string" ? record.email.trim() : "";
  const apiKeyRaw = record.api_key ?? record.apiKey;
  const apiKey = typeof apiKeyRaw === "string" ? apiKeyRaw.trim() : "";
  if (!isValidEmail(email) || apiKey.length === 0) {
    return null;
  }
  return { email, apiKey };
}

async function fetchSessionUserEmail(baseRealm: string): Promise<string | null> {
  try {
    const response = await fetch(`${baseRealm}/json/users/me`, {
      method: "GET",
      credentials: "include",
    });
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as { email?: unknown };
    const email = typeof data.email === "string" ? data.email.trim() : "";
    return isValidEmail(email) ? email : null;
  } catch {
    return null;
  }
}

function buildSessionFallbackEmail(baseRealm: string): string {
  try {
    return `session@${new URL(baseRealm).hostname}`;
  } catch {
    return "session@unknown.local";
  }
}

/**
 * Completes OIDC desktop flow by exchanging decrypted login token
 * against /accounts/login/subdomain/<token>.
 *
 * Backend may return API credentials directly or establish cookie-based session auth.
 */
export async function exchangeDesktopFlowToken(
  realm: string,
  token: string,
): Promise<DesktopFlowExchangeResult> {
  const base = normalizeRealm(realm);
  const normalizedToken = token.trim();
  if (!base || normalizedToken.length === 0) {
    throw new ZulipAuthError(t("auth.pasteTokenInvalid"));
  }
  const encodedToken = encodeURIComponent(normalizedToken);

  let response: Response;
  try {
    response = await fetch(`${base}/accounts/login/subdomain/${encodedToken}`, {
      method: "GET",
      redirect: "manual",
      credentials: "include",
    });
  } catch {
    throw new ZulipAuthError(t("auth.pasteTokenInvalid"));
  }

  if (response.status >= 400) {
    let message: string | null;
    try {
      const data = (await response.json()) as { msg?: unknown };
      message = typeof data.msg === "string" ? data.msg : null;
    } catch {
      message = null;
    }
    throw new ZulipAuthError(message ?? t("auth.pasteTokenInvalid"));
  }

  let exchangePayload: unknown;
  try {
    exchangePayload = await response.json();
  } catch {
    exchangePayload = null;
  }

  const apiCredentials = normalizeExchangeCredentials(exchangePayload);
  if (apiCredentials) {
    return {
      authType: "api_key",
      email: apiCredentials.email,
      apiKey: apiCredentials.apiKey,
    };
  }

  const sessionEmail = await fetchSessionUserEmail(base);
  return {
    authType: "session",
    email: sessionEmail ?? buildSessionFallbackEmail(base),
  };
}

function normalizeApiPath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function ensureZulipApiReady(): void {
  if (!getCurrentInstance()) {
    throw new Error(t("app.noInstance"));
  }
  refreshZulipApiBase();
  refreshWorkspaceApiBase();
}

async function zulipPipelineGet(
  path: string,
  params?: Record<string, string>,
): Promise<{ ok: boolean; status: number; data: unknown } | null> {
  try {
    ensureZulipApiReady();
    const response = await zulipApi.get(normalizeApiPath(path), params);
    return {
      ok: response.ok,
      status: response.status,
      data: response.data,
    };
  } catch {
    return null;
  }
}

async function zulipPipelinePost(path: string, body: Record<string, string>) {
  ensureZulipApiReady();
  return zulipApi.post(normalizeApiPath(path), body);
}

async function zulipPipelinePatch(path: string, body: Record<string, string>) {
  ensureZulipApiReady();
  return zulipApi.patch(normalizeApiPath(path), body);
}

async function zulipPipelineDelete(path: string, body?: Record<string, string>) {
  ensureZulipApiReady();
  return zulipApi.delete(normalizeApiPath(path), body);
}

// --- Real-time events API (register + get-events) ---

import type { RegisterQueueResult, ZulipServerThumbnailFormat } from "./zulip.types";

export type { RegisterQueueResult, ZulipServerThumbnailFormat };

// Зачем: `realm` — в т.ч. `server_thumbnail_formats`; остальное — sidebar metadata.
const DEFAULT_REGISTER_FETCH_EVENT_TYPES = [
  "user_topics",
  "recent_private_conversations",
  "realm",
] as const;

export interface ZulipEvent {
  id: number;
  type: string;
  [key: string]: unknown;
}

export interface GetEventsResult {
  result?: string;
  msg?: string;
  code?: string;
  events?: ZulipEvent[];
  queue_id?: string;
}

export interface ZulipCredentials {
  realm: string;
  email: string;
  apiKey: string;
}

function getAuthValueForCredentials(credentials: ZulipCredentials): string {
  const authValue = getBasicAuthValue({
    email: credentials.email,
    apiKey: credentials.apiKey,
  });
  if (!authValue) {
    throw new Error(t("app.noInstance"));
  }
  return authValue;
}

function getValidatedCredentialsRealm(credentials: ZulipCredentials, context: string): string {
  return normalizeRealm(guard.url(credentials.realm, `${context}.realm`));
}

function validateQueueId(queueId: string, context: string): string {
  return guard.nonEmpty(queueId, `${context}.queueId`);
}

function validateEventCursor(lastEventId: number, context: string): number {
  invariant(
    Number.isInteger(lastEventId) && lastEventId >= -1,
    `${context}.lastEventId must be an integer >= -1, got: ${lastEventId}`,
  );
  return lastEventId;
}

/** Registers an event queue (POST /api/v1/register). Returns queue_id for subsequent long-polling. */
export async function registerQueue(
  eventTypes: string[],
  fetchEventTypes: string[] = [...DEFAULT_REGISTER_FETCH_EVENT_TYPES],
): Promise<RegisterQueueResult> {
  const body: Record<string, string> = {
    event_types: JSON.stringify(eventTypes),
  };
  if (fetchEventTypes.length > 0) {
    // Что делает: просит Zulip добавить в register нужные metadata-поля.
    body.fetch_event_types = JSON.stringify(fetchEventTypes);
  }
  const res = await zulipPipelinePost("register", body);
  const data = res.data as {
    result?: string;
    msg?: string;
    code?: string;
    queue_id?: string;
    last_event_id?: number;
    event_queue_longpoll_timeout_seconds?: number;
    user_topics?: unknown;
    recent_private_conversations?: unknown;
    server_thumbnail_formats?: unknown;
  } | null;
  if (data == null || typeof data !== "object") {
    throw new Error(t("app.invalidResponse"));
  }
  if (data.result === "error") {
    throw new Error(data.msg ?? data.code ?? t("app.queueRegistrationError"));
  }
  if (data.queue_id == null || data.last_event_id == null) {
    throw new Error(t("app.invalidRegisterResponse"));
  }

  const userTopics = parseUserTopics(data.user_topics);
  const recentPrivateConversations = parseRecentPrivateConversations(
    data.recent_private_conversations,
  );
  const serverThumbnailFormats = parseServerThumbnailFormats(data.server_thumbnail_formats);
  const cacheKey = getCurrentUserTopicsCacheKey();
  if (cacheKey && userTopics) {
    setCachedUserTopicsForKey(cacheKey, userTopics);
  }

  return {
    queue_id: data.queue_id,
    last_event_id: data.last_event_id,
    event_queue_longpoll_timeout_seconds: data.event_queue_longpoll_timeout_seconds,
    ...(userTopics ? { user_topics: userTopics } : {}),
    ...(recentPrivateConversations
      ? { recent_private_conversations: recentPrivateConversations }
      : {}),
    ...(serverThumbnailFormats ? { server_thumbnail_formats: serverThumbnailFormats } : {}),
  };
}

/** Registers queue with explicit credentials (used for background multi-org loops). */
export async function registerQueueForCredentials(
  credentials: ZulipCredentials,
  eventTypes: string[],
  fetchEventTypes: string[] = [...DEFAULT_REGISTER_FETCH_EVENT_TYPES],
): Promise<RegisterQueueResult> {
  const base = getValidatedCredentialsRealm(credentials, "registerQueueForCredentials");
  const authValue = getAuthValueForCredentials(credentials);
  const url = `${base}${env.ZULIP_API_PATH}/register`;

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        Authorization: authValue,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        event_types: JSON.stringify(eventTypes),
        // Зачем: background-loop для других инстансов должен получать такой же metadata-набор.
        ...(fetchEventTypes.length > 0
          ? { fetch_event_types: JSON.stringify(fetchEventTypes) }
          : {}),
      }).toString(),
    });
  } catch {
    throw new Error(t("app.queueRegistrationError"));
  }

  let data: {
    result?: string;
    msg?: string;
    code?: string;
    queue_id?: string;
    last_event_id?: number;
    event_queue_longpoll_timeout_seconds?: number;
    user_topics?: unknown;
    recent_private_conversations?: unknown;
    server_thumbnail_formats?: unknown;
  };
  try {
    data = (await response.json()) as typeof data;
  } catch {
    throw new Error(t("app.invalidResponse"));
  }

  if (data.result === "error") {
    throw new Error(data.msg ?? data.code ?? t("app.queueRegistrationError"));
  }
  if (data.queue_id == null || data.last_event_id == null) {
    throw new Error(t("app.invalidRegisterResponse"));
  }

  const userTopics = parseUserTopics(data.user_topics);
  const recentPrivateConversations = parseRecentPrivateConversations(
    data.recent_private_conversations,
  );
  const serverThumbnailFormats = parseServerThumbnailFormats(data.server_thumbnail_formats);
  setCachedUserTopicsForKey(
    buildUserTopicsCacheKey(credentials.realm, credentials.email),
    userTopics ?? [],
  );

  return {
    queue_id: data.queue_id,
    last_event_id: data.last_event_id,
    event_queue_longpoll_timeout_seconds: data.event_queue_longpoll_timeout_seconds,
    ...(userTopics ? { user_topics: userTopics } : {}),
    ...(recentPrivateConversations
      ? { recent_private_conversations: recentPrivateConversations }
      : {}),
    ...(serverThumbnailFormats ? { server_thumbnail_formats: serverThumbnailFormats } : {}),
  };
}

/**
 * Deletes an event queue (DELETE /api/v1/events).
 * Best-effort cleanup on logout/instance switch — swallows errors.
 * Pass credentials when cleaning up during instance switch (getCurrentInstance may already have changed).
 */
export async function deleteQueue(queueId: string, credentials?: ZulipCredentials): Promise<void> {
  try {
    const safeQueueId = queueId.trim();
    if (safeQueueId.length === 0) return;

    if (credentials == null) {
      const inst = getCurrentInstance();
      if (!inst) return;
      await zulipPipelineDelete("events", { queue_id: safeQueueId });
      return;
    }

    const base = getValidatedCredentialsRealm(credentials, "deleteQueue");
    const url = `${base}${env.ZULIP_API_PATH}/events`;
    const authValue = getBasicAuthValue({ email: credentials.email, apiKey: credentials.apiKey });
    if (!authValue) return;
    await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: authValue,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ queue_id: safeQueueId }).toString(),
    });
  } catch {
    // Best-effort cleanup
  }
}

const UNREAD_MESSAGES_NUM_BEFORE = 5000;
const UNREAD_MESSAGES_NUM_AFTER = 0;
const UNREAD_MESSAGES_NARROW = JSON.stringify([{ operator: "is", operand: "unread" }]);

/**
 * Reads total unread count for any instance credentials (GET /api/v1/messages?narrow=is:unread).
 * Returns null when request fails or payload cannot be parsed.
 */
export async function fetchUnreadMessagesCountForCredentials(
  credentials: ZulipCredentials,
  options?: { signal?: AbortSignal },
): Promise<number | null> {
  let base: string;
  try {
    base = getValidatedCredentialsRealm(credentials, "fetchUnreadMessagesCountForCredentials");
  } catch {
    return null;
  }
  const url = new URL(`${base}${env.ZULIP_API_PATH}/messages`);
  url.searchParams.set("anchor", "newest");
  url.searchParams.set("num_before", String(UNREAD_MESSAGES_NUM_BEFORE));
  url.searchParams.set("num_after", String(UNREAD_MESSAGES_NUM_AFTER));
  url.searchParams.set("narrow", UNREAD_MESSAGES_NARROW);
  url.searchParams.set("allow_empty_topic_name", "true");
  url.searchParams.set("client_gravatar", "true");
  const authValue = getBasicAuthValue({
    email: credentials.email,
    apiKey: credentials.apiKey,
  });
  if (authValue == null) return null;

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: authValue,
      },
      signal: options?.signal,
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  try {
    const payload = (await response.json()) as unknown;
    return parseUnreadMessagesCount(payload);
  } catch {
    return null;
  }
}

/** Long-polls for events (GET /api/v1/events). Supports timeout and AbortSignal. */
export async function getEvents(
  queueId: string,
  lastEventId: number,
  options?: { timeoutSec?: number; signal?: AbortSignal },
): Promise<GetEventsResult> {
  const safeQueueId = validateQueueId(queueId, "getEvents");
  const safeLastEventId = validateEventCursor(lastEventId, "getEvents");
  ensureZulipApiReady();

  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  if (options?.timeoutSec != null && options.timeoutSec > 0) {
    timeoutId = setTimeout(() => controller.abort(), options.timeoutSec * 1000);
  }

  const onAbort = () => {
    if (timeoutId != null) clearTimeout(timeoutId);
    controller.abort();
  };
  if (options?.signal) {
    options.signal.addEventListener("abort", onAbort);
  }
  const signal = controller.signal;

  const cleanup = () => {
    if (timeoutId != null) clearTimeout(timeoutId);
    if (options?.signal) {
      options.signal.removeEventListener("abort", onAbort);
    }
  };

  try {
    const res = await zulipApi.get(
      "/events",
      {
        queue_id: safeQueueId,
        last_event_id: String(safeLastEventId),
      },
      signal,
    );
    cleanup();
    const data = res.data;
    if (data == null || typeof data !== "object") {
      return { result: "error", msg: "Invalid JSON in event response" };
    }
    return data as GetEventsResult;
  } catch (e) {
    cleanup();
    throw e;
  }
}

/** Long-polls events using explicit credentials (used for background multi-org loops). */
export async function getEventsForCredentials(
  credentials: ZulipCredentials,
  queueId: string,
  lastEventId: number,
  options?: { timeoutSec?: number; signal?: AbortSignal },
): Promise<GetEventsResult> {
  const safeQueueId = validateQueueId(queueId, "getEventsForCredentials");
  const safeLastEventId = validateEventCursor(lastEventId, "getEventsForCredentials");
  const base = getValidatedCredentialsRealm(credentials, "getEventsForCredentials");
  const authValue = getAuthValueForCredentials(credentials);
  const url = new URL(`${base}${env.ZULIP_API_PATH}/events`);
  url.searchParams.set("queue_id", safeQueueId);
  url.searchParams.set("last_event_id", String(safeLastEventId));

  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  if (options?.timeoutSec != null && options.timeoutSec > 0) {
    timeoutId = setTimeout(() => controller.abort(), options.timeoutSec * 1000);
  }

  const onAbort = () => {
    if (timeoutId != null) clearTimeout(timeoutId);
    controller.abort();
  };
  if (options?.signal) {
    options.signal.addEventListener("abort", onAbort);
  }

  const cleanup = () => {
    if (timeoutId != null) clearTimeout(timeoutId);
    if (options?.signal) {
      options.signal.removeEventListener("abort", onAbort);
    }
  };

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: authValue,
      },
      signal: controller.signal,
    });

    let payload: unknown;
    try {
      payload = (await response.json()) as unknown;
    } catch {
      cleanup();
      return { result: "error", msg: "Invalid JSON in event response" };
    }
    cleanup();

    if (payload == null || typeof payload !== "object") {
      return { result: "error", msg: "Invalid JSON in event response" };
    }

    const data = payload as GetEventsResult;
    if (!response.ok && data.result == null) {
      return {
        ...data,
        result: "error",
        msg: data.msg ?? t("app.errorStatus", { status: String(response.status) }),
      };
    }
    return data;
  } catch (e) {
    cleanup();
    throw e;
  }
}

export interface ZulipCurrentUser {
  user_id: number;
  full_name: string;
  email: string;
}

function validateMessageIds(messageIds: number[], context: string): number[] {
  return messageIds.map((messageId, index) => guard.messageId(messageId, `${context}[${index}]`));
}

/** Marks messages as read (POST /api/v1/messages/flags). Call when opening a chat. */
export async function markMessagesAsRead(messageIds: number[]): Promise<void> {
  if (messageIds.length === 0) return;
  const validatedMessageIds = validateMessageIds(messageIds, "markMessagesAsRead.messageIds");
  await zulipPipelinePost("messages/flags", {
    messages: JSON.stringify(validatedMessageIds),
    op: "add",
    flag: "read",
  });
}

/** Bulk-marks all messages in a DM chat as read (POST /api/v1/messages/flags/narrow). */
export async function markDmAsRead(userIds: number[]): Promise<boolean> {
  const validatedUserIds = guard
    .nonEmptyArray(userIds, "markDmAsRead.userIds")
    .map((userId) => guard.userId(userId, "markDmAsRead.userIds"));
  const res = await zulipPipelinePost("messages/flags/narrow", {
    anchor: "newest",
    include_anchor: "false",
    num_before: "5000",
    num_after: "0",
    narrow: JSON.stringify([{ operator: "dm", operand: validatedUserIds }]),
    op: "add",
    flag: "read",
  });
  return res.ok;
}

/** Bulk-marks all messages in a stream as read (POST /api/v1/messages/flags/narrow). */
export async function markStreamAsRead(streamId: number): Promise<boolean> {
  guard.streamId(streamId, "markStreamAsRead");
  const res = await zulipPipelinePost("messages/flags/narrow", {
    anchor: "newest",
    include_anchor: "false",
    num_before: "5000",
    num_after: "0",
    narrow: JSON.stringify([{ operator: "stream", operand: streamId }]),
    op: "add",
    flag: "read",
  });
  return res.ok;
}

/** Bulk-marks all messages in a stream topic as read (POST /api/v1/messages/flags/narrow). */
export async function markTopicAsRead(streamId: number, topic: string): Promise<boolean> {
  guard.streamId(streamId, "markTopicAsRead");
  guard.nonEmpty(topic, "markTopicAsRead.topic");
  const res = await zulipPipelinePost("messages/flags/narrow", {
    anchor: "newest",
    include_anchor: "false",
    num_before: "5000",
    num_after: "0",
    narrow: JSON.stringify([
      { operator: "stream", operand: streamId },
      { operator: "topic", operand: topic },
    ]),
    op: "add",
    flag: "read",
  });
  return res.ok;
}

/**
 * Marks a stream topic as resolved/unresolved by renaming the whole topic thread.
 *
 * Zulip models "resolved" as a topic-name convention (checkmark prefix).
 * We PATCH the first message in the topic with propagate_mode=change_all.
 */
export async function setTopicResolvedState(
  streamId: number,
  topic: string,
  resolved: boolean,
): Promise<boolean> {
  guard.streamId(streamId, "setTopicResolvedState.streamId");
  const normalizedTopic = guard.nonEmpty(topic.trim(), "setTopicResolvedState.topic");
  const targetTopic = resolved
    ? toResolvedTopicName(normalizedTopic)
    : toUnresolvedTopicName(normalizedTopic);

  if (targetTopic === normalizedTopic) {
    return true;
  }

  const anchorMessageResponse = await zulipPipelineGet("/messages", {
    anchor: "oldest",
    num_before: "0",
    num_after: "1",
    include_anchor: "true",
    allow_empty_topic_name: "true",
    client_gravatar: "false",
    apply_markdown: "false",
    narrow: JSON.stringify([
      { operator: "stream", operand: streamId },
      { operator: "topic", operand: normalizedTopic },
    ]),
  });

  if (!anchorMessageResponse?.ok) {
    return false;
  }

  const anchorData = anchorMessageResponse.data as {
    result?: string;
    messages?: { id?: number }[];
  };
  if (anchorData.result === "error") {
    return false;
  }

  const anchorMessageId = anchorData.messages?.[0]?.id;
  if (anchorMessageId == null) {
    return false;
  }
  guard.messageId(anchorMessageId, "setTopicResolvedState.anchorMessageId");

  const patchResponse = await zulipPipelinePatch(`messages/${anchorMessageId}`, {
    topic: targetTopic,
    propagate_mode: "change_all",
    send_notification_to_old_thread: "false",
    send_notification_to_new_thread: "false",
    send_webhook_notifications: "false",
  });

  if (!patchResponse.ok) {
    return false;
  }

  const patchData = patchResponse.data as { result?: string };
  return patchData.result !== "error";
}

export async function getCurrentUser(): Promise<ZulipCurrentUser | null> {
  const res = await zulipPipelineGet("/users/me");
  if (!res?.ok) {
    return null;
  }
  const data = res.data as {
    result?: string;
    user_id?: number;
    full_name?: string;
    email?: string;
  };
  if (data.result === "error" || data.user_id == null) return null;
  return {
    user_id: data.user_id,
    full_name: data.full_name ?? "",
    email: data.email ?? "",
  };
}

/** Map of user_id to relative avatar_url path. */
export type AvatarUrlByUserId = Map<number, string>;

/** A single user entry from GET /users. */
export interface ZulipUserMember {
  user_id: number;
  full_name?: string;
  email?: string;
  avatar_url?: string | null;
  role?: number;
  /** Present when `include_custom_profile_fields=true`. */
  profile_data?: Record<string, { value?: string; rendered_value?: string }>;
}

/** Fetches the full user list (GET /users) for populating usersStore. */
export async function fetchUsers(): Promise<ZulipUserMember[]> {
  const res = await zulipPipelineGet("/users", {
    client_gravatar: "false",
    include_custom_profile_fields: "true",
  });
  if (!res?.ok) {
    return [];
  }
  const data = res.data as {
    result?: string;
    members?: ZulipUserMember[];
    users?: ZulipUserMember[];
  };
  if (data.result === "error") return [];
  return Array.isArray(data.members) ? data.members : Array.isArray(data.users) ? data.users : [];
}

/** Fetches a single user by ID (GET /users/{user_id}). Used for DM profile panel. */
export async function fetchUser(userId: number): Promise<ZulipUserMember | null> {
  guard.userId(userId, "fetchUser");
  const res = await zulipPipelineGet(`/users/${userId}`, {
    client_gravatar: "false",
    include_custom_profile_fields: "true",
  });
  if (!res?.ok) {
    return null;
  }
  const data = res.data as {
    result?: string;
    user?: ZulipUserMember;
  };
  if (data.result === "error" || !data.user?.user_id) return null;
  return data.user;
}

/** Response shape from GET /api/v1/realm/presence (keyed by user email). */
export interface RealmPresenceEntry {
  aggregated?: { status: string; timestamp: number };
  website?: { status: string; timestamp: number };
}

export interface RealmPresenceResponse {
  result?: string;
  presences?: Record<string, RealmPresenceEntry>;
  server_timestamp?: number;
}

/** Fetches presence data for all users (GET /api/v1/realm/presence). */
export async function fetchRealmPresence(): Promise<RealmPresenceResponse> {
  const res = await zulipPipelineGet("/realm/presence");
  if (!res?.ok) {
    return { result: "error" };
  }
  return res.data as RealmPresenceResponse;
}

/**
 * Fetches users and returns a user_id → avatar_url map.
 * Prefer fetchUsers() + usersStore for caching; this is a convenience shortcut.
 */
export async function fetchUsersAvatarMap(): Promise<AvatarUrlByUserId> {
  const list = await fetchUsers();
  const map = new Map<number, string>();
  for (const u of list) {
    if (u.user_id != null && u.avatar_url != null && String(u.avatar_url).trim() !== "") {
      map.set(u.user_id, String(u.avatar_url).trim());
    }
  }
  return map;
}

/** A single reaction on a message (Zulip API shape). */
export interface Reaction {
  emoji_name: string;
  emoji_code: string;
  reaction_type: "unicode_emoji" | "realm_emoji" | "zulip_extra_emoji";
  user_id: number;
}

/** Raw message from GET /messages. Absence of 'read' in flags means unread. */
export interface ZulipRawMessage {
  id: number;
  sender_id: number;
  sender_full_name?: string;
  /** Sender avatar (relative path), present in GET /messages response. */
  avatar_url?: string | null;
  content: string;
  timestamp: number;
  display_recipient?:
    | string
    | { id: number; full_name: string; email?: string; avatar_url?: string }[];
  subject?: string;
  type?: string;
  stream_id?: number | null;
  flags?: string[];
  reactions?: Reaction[];
}

interface MessageWindowOptions {
  anchor: string | number;
  numBefore: number;
  numAfter: number;
  includeAnchor?: boolean;
  narrow?: { operator: string; operand: string | number | number[] }[];
  /** When set and `CHAT_LIST_FLOW_DEBUG` is on, logs GET /messages request/response for sidebar bootstrap. */
  flowDebugLabel?: string;
}

type MessagesApiAnchor = number | "newest" | "oldest" | "first_unread";

const ALLOWED_MESSAGE_ANCHORS = ["newest", "oldest", "first_unread"] as const;

function validateMessagesApiAnchor(anchor: string | number, context: string): MessagesApiAnchor {
  if (typeof anchor === "number") {
    return guard.messageId(anchor, `${context}.anchor`);
  }
  const normalizedAnchor = guard.nonEmpty(anchor, `${context}.anchor`);
  return guard.oneOf(normalizedAnchor, ALLOWED_MESSAGE_ANCHORS, `${context}.anchor`);
}

function validateNonNegativeInteger(value: number, label: string): number {
  invariant(
    Number.isInteger(value) && value >= 0,
    `${label} must be a non-negative integer, got: ${value}`,
  );
  return value;
}

async function fetchMessageWindow(options: MessageWindowOptions): Promise<ZulipRawMessage[]> {
  const { anchor, numBefore, numAfter, includeAnchor, narrow, flowDebugLabel } = options;
  if (flowDebugLabel != null) {
    logChatListFlow(`api: GET /messages → ${flowDebugLabel} (request)`, {
      anchor,
      numBefore,
      numAfter,
      includeAnchor: includeAnchor ?? null,
      hasNarrow: narrow != null,
    });
  }
  const res = await zulipPipelineGet("/messages", {
    anchor: String(anchor),
    ...(includeAnchor == null ? {} : { include_anchor: includeAnchor ? "true" : "false" }),
    num_before: String(numBefore),
    num_after: String(numAfter),
    ...(narrow == null ? {} : { narrow: JSON.stringify(narrow) }),
    client_gravatar: "true",
    allow_empty_topic_name: "true",
    apply_markdown: "false",
  });
  if (!res?.ok) {
    if (flowDebugLabel != null) {
      logChatListFlow(`api: GET /messages → ${flowDebugLabel} (non-ok)`, { ok: res?.ok ?? false });
    }
    return [];
  }
  const data = res.data as { result?: string; messages?: ZulipRawMessage[] };
  if (!data || data.result === "error") {
    if (flowDebugLabel != null) {
      logChatListFlow(`api: GET /messages → ${flowDebugLabel} (error payload)`, {
        result: data?.result,
      });
    }
    return [];
  }
  const messages = data.messages ?? [];
  if (flowDebugLabel != null) {
    logChatListFlow(`api: GET /messages → ${flowDebugLabel} (response)`, {
      ...summarizeZulipMessagesForFlowDebug(messages),
    });
  }
  return messages;
}

/** Fetches the latest 1000 messages (no narrow) to build the sidebar chat/channel list. */
export async function fetchRecentMessages(): Promise<ZulipRawMessage[]> {
  return fetchMessageWindow({
    anchor: "newest",
    numBefore: 1000,
    numAfter: 0,
    flowDebugLabel: "fetchRecentMessages (chat list bootstrap / reconnect fallback)",
  });
}

/** Fetches older chat-list messages before anchor (used for deep bootstrap backfill). */
export async function fetchMessagesBeforeAnchor(
  anchorMessageId: number,
  numBefore = 5000,
): Promise<ZulipRawMessage[]> {
  guard.messageId(anchorMessageId, "fetchMessagesBeforeAnchor.anchorMessageId");
  return fetchMessageWindow({
    anchor: anchorMessageId,
    numBefore,
    numAfter: 0,
    includeAnchor: false,
    flowDebugLabel: "fetchMessagesBeforeAnchor (chat list deep history)",
  });
}

/** Fetches newer chat-list messages after anchor (used after reconnect). */
export async function fetchMessagesAfterAnchor(
  anchorMessageId: number,
  numAfter = 5000,
): Promise<ZulipRawMessage[]> {
  guard.messageId(anchorMessageId, "fetchMessagesAfterAnchor.anchorMessageId");
  return fetchMessageWindow({
    anchor: anchorMessageId,
    numBefore: 0,
    numAfter,
    includeAnchor: false,
    flowDebugLabel: "fetchMessagesAfterAnchor (chat list delta / reconnect)",
  });
}

export interface DirectMessagesPageResult {
  messages: ZulipRawMessage[];
  foundOldest: boolean;
}

/** Fetches a page across all direct messages (narrow=is:dm) for metadata backfill. */
export async function fetchDirectMessagesPage(
  anchor: number | "newest" = "newest",
  numBefore = 5000,
): Promise<DirectMessagesPageResult> {
  // Что делает: берем широкую выборку DM, чтобы восстановить старые диалоги без полного bootstrap всех сообщений.
  const normalizedAnchor =
    anchor === "newest" ? anchor : guard.messageId(anchor, "fetchDirectMessagesPage.anchor");
  const safeNumBefore = validateNonNegativeInteger(numBefore, "fetchDirectMessagesPage.numBefore");
  logChatListFlow("api: GET /messages → fetchDirectMessagesPage (request)", {
    anchor: normalizedAnchor,
    numBefore: safeNumBefore,
    narrow: "is:dm",
  });
  const res = await zulipPipelineGet("/messages", {
    anchor: String(normalizedAnchor),
    include_anchor: "false",
    num_before: String(safeNumBefore),
    num_after: "0",
    narrow: JSON.stringify([{ operator: "is", operand: "dm" }]),
    client_gravatar: "true",
    allow_empty_topic_name: "true",
  });
  if (!res?.ok) {
    logChatListFlow("api: GET /messages → fetchDirectMessagesPage (non-ok)", { ok: false });
    return { messages: [], foundOldest: false };
  }
  const data = res.data as {
    result?: string;
    messages?: ZulipRawMessage[];
    found_oldest?: boolean;
    foundOldest?: boolean;
  };
  if (!data || data.result === "error") {
    logChatListFlow("api: GET /messages → fetchDirectMessagesPage (error payload)", {
      result: data?.result,
    });
    return { messages: [], foundOldest: false };
  }
  const dmPageMessages = data.messages ?? [];
  const foundOldest = data.found_oldest ?? data.foundOldest ?? false;
  logChatListFlow("api: GET /messages → fetchDirectMessagesPage (response)", {
    ...summarizeZulipMessagesForFlowDebug(dmPageMessages),
    foundOldest,
  });
  return {
    messages: dmPageMessages,
    foundOldest,
  };
}

export type ActivityFilter = "starred" | "mentions" | "reactions";

interface NarrowEntry {
  negated?: boolean;
  operator: string;
  operand: string | number;
}

function getActivityNarrow(filter: ActivityFilter, currentUserId?: number | null): NarrowEntry[] {
  switch (filter) {
    case "starred":
      return [{ negated: false, operator: "is", operand: "starred" }];
    case "mentions":
      return [{ negated: false, operator: "is", operand: "mentioned" }];
    case "reactions":
      if (currentUserId == null) {
        return [{ negated: false, operator: "has", operand: "reaction" }];
      }
      return [
        { negated: false, operator: "has", operand: "reaction" },
        {
          negated: false,
          operator: "sender",
          operand: guard.userId(currentUserId, "fetchActivityMessagesPage.currentUserId"),
        },
      ];
    default:
      return [];
  }
}

/** Fetches messages for the "My Activity" section (starred, mentions, reactions). */
export async function fetchActivityMessages(
  filter: ActivityFilter,
  currentUserId?: number | null,
  anchor: number | "newest" = "newest",
  numBefore = 200,
): Promise<ZulipRawMessage[]> {
  const page = await fetchActivityMessagesPage(filter, currentUserId, anchor, numBefore);
  return page.messages;
}

export interface ActivityMessagesPageResult {
  messages: ZulipRawMessage[];
  foundOldest: boolean;
}

export async function fetchActivityMessagesPage(
  filter: ActivityFilter,
  currentUserId?: number | null,
  anchor: number | "newest" = "newest",
  numBefore = 200,
): Promise<ActivityMessagesPageResult> {
  const normalizedAnchor =
    anchor === "newest" ? anchor : guard.messageId(anchor, "fetchActivityMessagesPage.anchor");
  const narrow = getActivityNarrow(filter, currentUserId);
  const res = await zulipPipelineGet("/messages", {
    anchor: String(normalizedAnchor),
    num_before: String(numBefore),
    num_after: "0",
    narrow: JSON.stringify(narrow),
    allow_empty_topic_name: "true",
    client_gravatar: "true",
    apply_markdown: "false",
  });
  if (!res?.ok) return { messages: [], foundOldest: false };
  const data = res.data as {
    result?: string;
    messages?: ZulipRawMessage[];
    found_oldest?: boolean;
    foundOldest?: boolean;
  };
  if (!data || data.result === "error") return { messages: [], foundOldest: false };
  return {
    messages: data.messages ?? [],
    foundOldest: data.found_oldest ?? data.foundOldest ?? false,
  };
}

export interface MockStream {
  stream_id: number;
  name: string;
  description: string;
  is_announcement_only: boolean;
}

export type MockMessageDeliveryStatus = "sending" | "failed" | "sent";

export interface MockMessage {
  id: number;
  sender_id: number;
  sender_full_name: string;
  stream_id: number | null;
  display_recipient?:
    | string
    | { id: number; full_name: string; email?: string; avatar_url?: string }[];
  channel?: string;
  subject: string;
  content: string;
  /** Markdown for editing / quotes; mirrors Markdown `content` when not HTML. */
  markdown_source?: string;
  timestamp: number;
  /** API flags (e.g. 'read', 'mentioned'). Missing 'read' = unread. */
  flags?: string[];
  reactions?: Reaction[];
  /** Local delivery state for optimistic outgoing messages. */
  delivery_status?: MockMessageDeliveryStatus;
  /**
   * Stable client key for list reconciliation (negative id while optimistic).
   * Preserved after the server assigns a positive message id.
   */
  local_echo_key?: number;
}

export { rawMessageToMockMessage };

function mapZulipMessage(m: Parameters<typeof rawMessageToMockMessage>[0]): MockMessage {
  return rawMessageToMockMessage(m);
}

export interface ZulipSubscription {
  stream_id: number;
  name: string;
  is_muted: boolean;
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
    }[];
  };
  return (data.subscriptions ?? []).map((s) => ({
    stream_id: s.stream_id,
    name: s.name,
    is_muted: s.is_muted ?? !(s.in_home_view ?? true),
  }));
}

/** Returns user topic visibility overrides from the register-queue snapshot cache. */
export function fetchUserTopics(): Promise<ZulipUserTopic[]> {
  const cacheKey = getCurrentUserTopicsCacheKey();
  if (!cacheKey) {
    return Promise.resolve([]);
  }
  return Promise.resolve([...(userTopicsByInstance.get(cacheKey) ?? [])]);
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

export async function fetchMessages(
  stream?: string,
  topic?: string,
  q?: string,
): Promise<MockMessage[]> {
  const normalizedStream =
    stream == null ? undefined : guard.nonEmpty(stream, "fetchMessages.stream");
  const normalizedTopic = topic == null ? undefined : guard.nonEmpty(topic, "fetchMessages.topic");
  if (normalizedTopic !== undefined && normalizedStream === undefined) {
    throw new Error("fetchMessages.stream is required when topic is provided");
  }
  const narrow: MessagesApiNarrow[] = [];
  if (normalizedStream) narrow.push({ operator: "stream", operand: normalizedStream });
  if (normalizedTopic) narrow.push({ operator: "topic", operand: normalizedTopic });
  if (q?.trim()) narrow.push({ operator: "search", operand: q.trim() });
  const page = await fetchMessagesWithNarrowPage(
    narrow,
    "newest",
    ZULIP_STREAM_CHAT_NUM_BEFORE,
    ZULIP_STREAM_CHAT_NUM_AFTER,
  );
  return page.messages;
}

interface MessagesApiNarrow {
  operator: string;
  operand: string | number | number[];
}

// Карта in-flight запросов страниц сообщений для дедупликации параллельных вызовов.
const messagesPageInFlight = new Map<string, Promise<MessagesPageResult>>();

function normalizeNarrowOperandForInFlightKey(
  operand: string | number | number[],
): string | number {
  if (!Array.isArray(operand)) {
    return operand;
  }
  return Array.from(new Set(operand))
    .sort((a, b) => a - b)
    .join(",");
}

function buildMessagesPageInFlightKey(
  narrow: readonly MessagesApiNarrow[],
  anchor: string | number,
  numBefore: number,
  numAfter: number,
): string {
  const instanceId = getCurrentInstance()?.id ?? "__no_instance__";
  const normalizedNarrow = narrow.map((entry) => ({
    operator: entry.operator,
    operand: normalizeNarrowOperandForInFlightKey(entry.operand),
  }));
  return JSON.stringify({
    instanceId,
    narrow: normalizedNarrow,
    anchor,
    numBefore,
    numAfter,
  });
}

/** Универсальная загрузка сообщений по narrow с настраиваемыми anchor и лимитами. */
export async function fetchMessagesWithNarrow(
  narrow: MessagesApiNarrow[],
  anchor: string | number = "newest",
  numBefore = ZULIP_STREAM_CHAT_NUM_BEFORE,
  numAfter = ZULIP_STREAM_CHAT_NUM_AFTER,
): Promise<MockMessage[]> {
  const page = await fetchMessagesWithNarrowPage(narrow, anchor, numBefore, numAfter);
  return page.messages;
}

export interface MessagesPageResult {
  messages: MockMessage[];
  foundOldest: boolean;
  foundNewest: boolean;
}

/** Универсальная загрузка страницы сообщений по narrow с метаданными пагинации. */
export async function fetchMessagesWithNarrowPage(
  narrow: MessagesApiNarrow[],
  anchor: string | number = "newest",
  numBefore = ZULIP_STREAM_CHAT_NUM_BEFORE,
  numAfter = ZULIP_STREAM_CHAT_NUM_AFTER,
): Promise<MessagesPageResult> {
  const validatedAnchor = validateMessagesApiAnchor(anchor, "fetchMessagesWithNarrowPage");
  const validatedNumBefore = validateNonNegativeInteger(numBefore, "numBefore");
  const validatedNumAfter = validateNonNegativeInteger(numAfter, "numAfter");
  const requestKey = buildMessagesPageInFlightKey(
    narrow,
    validatedAnchor,
    validatedNumBefore,
    validatedNumAfter,
  );
  const inFlight = messagesPageInFlight.get(requestKey);
  if (inFlight) {
    return inFlight;
  }

  const request = (async () => {
    const client = await getClient();
    try {
      const data = (await client.messages.retrieve({
        narrow: narrow.length > 0 ? narrow : undefined,
        anchor: validatedAnchor,
        num_before: validatedNumBefore,
        num_after: validatedNumAfter,
        apply_markdown: false,
      })) as {
        result?: string;
        messages?: Parameters<typeof mapZulipMessage>[0][];
        found_oldest?: boolean;
        foundOldest?: boolean;
        found_newest?: boolean;
        foundNewest?: boolean;
      };
      if (data.result === "error") return { messages: [], foundOldest: false, foundNewest: false };
      return {
        messages: (data.messages ?? []).map(mapZulipMessage),
        foundOldest: data.found_oldest ?? data.foundOldest ?? false,
        foundNewest: data.found_newest ?? data.foundNewest ?? false,
      };
    } catch {
      return { messages: [], foundOldest: false, foundNewest: false };
    }
  })();

  messagesPageInFlight.set(requestKey, request);
  return request.finally(() => {
    if (messagesPageInFlight.get(requestKey) === request) {
      messagesPageInFlight.delete(requestKey);
    }
  });
}

/** Fetches a page of all messages (no narrow) via API pipeline. */
export async function fetchAllMessagesPage(
  anchor: string | number = "newest",
  numBefore = 100,
): Promise<MessagesPageResult> {
  const validatedAnchor = validateMessagesApiAnchor(anchor, "fetchAllMessagesPage");
  const validatedNumBefore = validateNonNegativeInteger(numBefore, "numBefore");
  const res = await zulipPipelineGet("/messages", {
    anchor: String(validatedAnchor),
    num_before: String(validatedNumBefore),
    num_after: "0",
    narrow: "[]",
    allow_empty_topic_name: "true",
    client_gravatar: "true",
    apply_markdown: "false",
  });

  if (!res?.ok) {
    return { messages: [], foundOldest: false, foundNewest: false };
  }

  const data = res.data as {
    result?: string;
    msg?: string;
    messages?: ZulipRawMessage[];
    found_oldest?: boolean;
    foundOldest?: boolean;
    found_newest?: boolean;
    foundNewest?: boolean;
  };

  if (!data || data.result === "error") {
    return { messages: [], foundOldest: false, foundNewest: false };
  }

  return {
    messages: (data.messages ?? []).map(rawMessageToMockMessage),
    foundOldest: data.found_oldest ?? data.foundOldest ?? false,
    foundNewest: data.found_newest ?? data.foundNewest ?? false,
  };
}

/** Формат DM narrow: operand — массив user_id участников, например [427]. */
interface DmNarrow {
  negated: false;
  operator: "dm";
  operand: number[];
}

// Смещение synthetic-id для групповых DM в sidebar — такие id нельзя отправлять в API.

const GROUP_DM_ID_OFFSET = 2_000_000;
// Карта in-flight запросов DM-истории для дедупликации параллельных вызовов.
const dmMessagesInFlight = new Map<string, Promise<MockMessage[]>>();

function buildDmMessagesInFlightKey(userIds: readonly number[]): string {
  return Array.from(new Set(userIds))
    .sort((a, b) => a - b)
    .join(",");
}

/** Загружает сообщения DM (1:1 или групповой). Для 1:1 передайте id собеседника. */
export async function fetchDmMessages(userIds: number | number[]): Promise<MockMessage[]> {
  const rawIds = Array.isArray(userIds) ? userIds : [userIds];
  if (rawIds.length === 0) return [];
  const validatedIds = rawIds.map((userId, index) =>
    guard.userId(userId, `fetchDmMessages.userIds[${index}]`),
  );
  const ids = Array.from(new Set(validatedIds)).sort((a, b) => a - b);
  if (ids.some((id) => id >= GROUP_DM_ID_OFFSET)) return [];

  const requestKey = buildDmMessagesInFlightKey(ids);
  const inFlight = dmMessagesInFlight.get(requestKey);
  if (inFlight) {
    return inFlight;
  }

  const params = {
    narrow: [{ negated: false, operator: "dm", operand: ids }] as DmNarrow[],
    anchor: "newest",
    num_before: ZULIP_DM_CHAT_NUM_BEFORE,
    num_after: ZULIP_DM_CHAT_NUM_AFTER,
    client_gravatar: true,
    allow_empty_topic_name: true,
    apply_markdown: false,
  };
  const request = (async () => {
    try {
      const client = await getClient();
      const data = await client.messages.retrieve(
        params as Parameters<ZulipClient["messages"]["retrieve"]>[0],
      );
      const raw = data as { result?: string; messages?: Parameters<typeof mapZulipMessage>[0][] };
      if (raw.result === "error") return [];
      const list = raw.messages ?? [];
      return list.map(mapZulipMessage);
    } catch {
      return [];
    }
  })();

  dmMessagesInFlight.set(requestKey, request);
  return request.finally(() => {
    if (dmMessagesInFlight.get(requestKey) === request) {
      dmMessagesInFlight.delete(requestKey);
    }
  });
}

/** Fetches a single message by id. Returns null on non-ok/error response. */
export async function fetchMessageById(messageId: number): Promise<MockMessage | null> {
  guard.messageId(messageId, "fetchMessageById");
  const res = await zulipPipelineGet(`/messages/${messageId}`, {
    allow_empty_topic_name: "true",
    apply_markdown: "false",
  });
  if (!res?.ok) {
    return null;
  }
  return mockMessageFromGetMessageApiData(res.data);
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
  return (data.topics ?? []).map((t) => t.name);
}

export interface SendMessageParams {
  /** For stream message: stream name. Omit when using `to` for private. */
  stream?: string;
  /** Optional stream ID for a more faithful optimistic payload. */
  streamId?: number;
  subject?: string;
  content: string;
  sender_id?: number;
  sender_full_name?: string;
  /** For private/DM message: recipient user ids. When set, `stream` is ignored. */
  to?: number[];
}

/** Fetches saved snippets for the current user (GET /api/v1/saved_snippets). */
export async function fetchSavedSnippets(): Promise<SavedSnippet[]> {
  const res = await zulipPipelineGet("/saved_snippets");
  if (!res?.ok) {
    throw new Error(t("app.errorStatus", { status: String(res?.status ?? 0) }));
  }
  const data = res.data as { result?: string; msg?: string; saved_snippets?: unknown[] };
  if (data.result === "error") {
    throw new Error(data.msg ?? t("app.unknownError"));
  }
  if (!Array.isArray(data.saved_snippets)) {
    return [];
  }
  const snippets: SavedSnippet[] = [];
  for (const item of data.saved_snippets) {
    if (item == null || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "number" ? row.id : 0;
    const title = typeof row.title === "string" ? row.title : "";
    const content = typeof row.content === "string" ? row.content : "";
    const dateCreated =
      typeof row.date_created === "number"
        ? row.date_created
        : typeof row.dateCreated === "number"
          ? row.dateCreated
          : 0;
    if (id <= 0 || title.trim().length === 0 || content.trim().length === 0) continue;
    snippets.push({
      id,
      title,
      content,
      date_created: dateCreated,
    });
  }
  snippets.sort((left, right) => left.title.localeCompare(right.title));
  return snippets;
}

/** Creates a saved snippet (POST /api/v1/saved_snippets). */
export async function createSavedSnippet(params: {
  title: string;
  content: string;
}): Promise<number> {
  const title = guard.nonEmpty(params.title.trim(), "createSavedSnippet.title");
  const content = guard.nonEmpty(params.content.trim(), "createSavedSnippet.content");
  const res = await zulipPipelinePost("/saved_snippets", { title, content });
  const data = res.data as { result?: string; msg?: string; saved_snippet_id?: number };
  if (!res.ok || data.result === "error") {
    throw new Error(data.msg ?? t("app.errorStatus", { status: String(res.status) }));
  }
  return data.saved_snippet_id ?? 0;
}

export async function sendMessage(params: SendMessageParams): Promise<MockMessage> {
  const isPrivate = params.to != null && params.to.length > 0;
  if (!isPrivate && !params.stream) {
    throw new Error(t("message.sendRequiresStreamOrTo"));
  }
  const content = guard.nonEmpty(params.content, "sendMessage.content");
  const client = await getClient();

  if (isPrivate) {
    const recipients = params.to ?? [];
    for (const recipientId of recipients) {
      guard.userId(recipientId, "sendMessage.to");
    }
    const result = await client.messages.send({
      type: "private",
      to: recipients,
      content,
    });
    const id = result.id ?? 0;
    const authoritative = id > 0 ? await fetchMessageById(id) : null;
    if (authoritative) return authoritative;
    return {
      id,
      sender_id: params.sender_id ?? 0,
      sender_full_name: params.sender_full_name ?? t("common.you"),
      stream_id: null,
      display_recipient: recipients.map((recipientId) => ({ id: recipientId, full_name: "" })),
      subject: "",
      content,
      timestamp: Math.floor(Date.now() / 1000),
    };
  }

  const stream = guard.nonEmpty(params.stream, "sendMessage.stream");
  if (params.streamId != null) {
    guard.streamId(params.streamId, "sendMessage.streamId");
  }
  const subject = params.subject ?? "general";
  const result = await client.messages.send({
    type: "stream",
    to: stream,
    topic: subject,
    content,
  });
  const id = result.id ?? 0;
  const authoritative = id > 0 ? await fetchMessageById(id) : null;
  if (authoritative) return authoritative;
  return {
    id,
    sender_id: params.sender_id ?? 0,
    sender_full_name: params.sender_full_name ?? t("common.you"),
    stream_id: params.streamId ?? null,
    display_recipient: stream,
    channel: stream,
    subject,
    content,
    timestamp: Math.floor(Date.now() / 1000),
  };
}

/** Renders markdown content via Zulip for composer preview (POST /api/v1/messages/render). */
export async function renderMessageContent(content: string): Promise<string> {
  const normalizedContent = guard.nonEmpty(content, "renderMessageContent.content");
  const res = await zulipPipelinePost("messages/render", { content: normalizedContent });
  const data = res.data as { result?: string; msg?: string; rendered?: string };
  if (!res.ok || data.result === "error") {
    throw new Error(data.msg ?? t("app.errorStatus", { status: String(res.status) }));
  }
  if (typeof data.rendered !== "string") {
    throw new Error(t("app.invalidResponse"));
  }
  return data.rendered;
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

/** Updates a message's content (PATCH /api/v1/messages/{message_id}). */
export async function updateMessage(messageId: number, params: { content: string }): Promise<void> {
  guard.messageId(messageId, "updateMessage");
  const content = guard.nonEmpty(params.content, "updateMessage.content");
  const res = await zulipPipelinePatch(`messages/${messageId}`, {
    content,
  });
  if (!res.ok) {
    const data = res.data as { msg?: string };
    throw new Error(data.msg ?? t("app.errorStatus", { status: String(res.status) }));
  }
}

/** Deletes a message (DELETE /api/v1/messages/{message_id}). */
export async function deleteMessage(messageId: number): Promise<void> {
  guard.messageId(messageId, "deleteMessage");
  const res = await zulipPipelineDelete(`messages/${messageId}`);
  if (!res.ok) {
    const data = res.data as { msg?: string };
    throw new Error(data.msg ?? t("app.errorStatus", { status: String(res.status) }));
  }
}

/** Adds a reaction to a message (POST /api/v1/messages/{message_id}/reactions). */
export async function addReaction(
  messageId: number,
  emojiName: string,
  reactionType: "unicode_emoji" | "realm_emoji" | "zulip_extra_emoji" = "unicode_emoji",
): Promise<void> {
  guard.messageId(messageId, "addReaction");
  const normalizedEmojiName = guard.nonEmpty(emojiName, "addReaction.emojiName");
  const body: Record<string, string> = {
    emoji_name: normalizedEmojiName,
    reaction_type: reactionType,
  };
  const res = await zulipPipelinePost(`messages/${messageId}/reactions`, body);
  if (!res.ok) {
    const data = res.data as { msg?: string; code?: string };
    if (data.code === "REACTION_ALREADY_EXISTS") return;
    throw new Error(data.msg ?? t("app.errorStatus", { status: String(res.status) }));
  }
}

/** Removes a reaction from a message (DELETE /api/v1/messages/{message_id}/reactions). */
export async function removeReaction(
  messageId: number,
  emojiName: string,
  options?: { emojiCode?: string; reactionType?: string },
): Promise<void> {
  guard.messageId(messageId, "removeReaction");
  const normalizedEmojiName = guard.nonEmpty(emojiName, "removeReaction.emojiName");
  const body: Record<string, string> = { emoji_name: normalizedEmojiName };
  if (options?.emojiCode) body.emoji_code = options.emojiCode;
  if (options?.reactionType) body.reaction_type = options.reactionType;
  const res = await zulipPipelineDelete(`messages/${messageId}/reactions`, body);
  if (!res.ok) {
    const data = res.data as { msg?: string };
    throw new Error(data.msg ?? t("app.errorStatus", { status: String(res.status) }));
  }
}

/** Adds or removes a flag on messages (POST /api/v1/messages/flags). */
export async function updateMessageFlags(
  messageIds: number[],
  op: "add" | "remove",
  flag: string,
): Promise<void> {
  if (messageIds.length === 0) return;
  const validatedMessageIds = validateMessageIds(messageIds, "updateMessageFlags.messageIds");
  const validatedFlag = guard.nonEmpty(flag, "updateMessageFlags.flag");
  await zulipPipelinePost("messages/flags", {
    messages: JSON.stringify(validatedMessageIds),
    op,
    flag: validatedFlag,
  });
}

function toUploadUri(data: unknown): string {
  const response = data as { uri?: string; url?: string };
  const uri = response.uri ?? response.url;
  if (!uri) {
    throw new Error("No URI returned from upload");
  }
  return uri;
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function buildTusMetadata(file: File): string {
  const encode = (value: string) => Buffer.from(value, "utf-8").toString("base64");
  const parts = [`filename ${encode(file.name)}`];
  if (file.type) {
    parts.push(`type ${encode(file.type)}`);
  }
  return parts.join(",");
}

function resolveTusUploadUrl(locationHeader: string, apiBaseUrl: string): string {
  if (locationHeader.startsWith("http://") || locationHeader.startsWith("https://")) {
    return locationHeader;
  }
  return new URL(locationHeader, `${apiBaseUrl}/`).toString();
}

function parseUploadOffset(headers: Headers): number {
  const raw = headers.get("Upload-Offset") ?? headers.get("upload-offset") ?? "0";
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

async function findTusUploadedAttachmentPath(
  apiBaseUrl: string,
  authValue: string,
  expectedName: string,
  expectedSize: number,
  signal?: AbortSignal,
): Promise<string | null> {
  const res = await fetch(`${apiBaseUrl}/attachments`, {
    method: "GET",
    headers: { Authorization: authValue },
    signal,
  });
  if (!res.ok) {
    return null;
  }

  const payload = (await res.json()) as { attachments?: unknown };
  if (!Array.isArray(payload.attachments)) {
    return null;
  }

  let bestMatch: { pathId: string; createTime: number } | null = null;
  for (const item of payload.attachments) {
    if (item == null || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name : "";
    const size = typeof row.size === "number" ? row.size : -1;
    const pathId = typeof row.path_id === "string" ? row.path_id : "";
    const createTime = typeof row.create_time === "number" ? row.create_time : 0;
    if (!pathId || name !== expectedName || size !== expectedSize) continue;
    if (bestMatch == null || createTime > bestMatch.createTime) {
      bestMatch = { pathId, createTime };
    }
  }

  return bestMatch?.pathId ?? null;
}

async function uploadFileViaTus(
  file: File,
  credentials: ZulipCredentials,
  options?: { signal?: AbortSignal },
): Promise<string> {
  const authValue = getBasicAuthValue({
    email: credentials.email,
    apiKey: credentials.apiKey,
  });
  if (authValue == null) {
    throw new Error(t("app.noInstance"));
  }

  const apiBaseUrl = `${normalizeRealm(credentials.realm)}${env.ZULIP_API_PATH}`;
  const createRes = await fetch(`${apiBaseUrl}/tus`, {
    method: "POST",
    headers: {
      Authorization: authValue,
      "Tus-Resumable": TUS_VERSION,
      "Upload-Length": String(file.size),
      "Upload-Metadata": buildTusMetadata(file),
    },
    signal: options?.signal,
  });
  if (!createRes.ok) {
    throw new Error(t("app.errorStatus", { status: String(createRes.status) }));
  }

  const location = createRes.headers.get("location") ?? createRes.headers.get("Location");
  if (!location) {
    throw new Error("TUS: Location header is missing");
  }
  const uploadUrl = resolveTusUploadUrl(location, apiBaseUrl);

  const headRes = await fetch(uploadUrl, {
    method: "HEAD",
    headers: {
      Authorization: authValue,
      "Tus-Resumable": TUS_VERSION,
    },
    signal: options?.signal,
  });
  if (!headRes.ok) {
    throw new Error(t("app.errorStatus", { status: String(headRes.status) }));
  }

  let offset = parseUploadOffset(headRes.headers);
  while (offset < file.size) {
    const nextOffset = Math.min(offset + TUS_CHUNK_SIZE_BYTES, file.size);
    const chunk = file.slice(offset, nextOffset);
    const patchRes = await fetch(uploadUrl, {
      method: "PATCH",
      headers: {
        Authorization: authValue,
        "Tus-Resumable": TUS_VERSION,
        "Upload-Offset": String(offset),
        "Content-Type": "application/offset+octet-stream",
        "Content-Length": String(chunk.size),
      },
      body: chunk,
      signal: options?.signal,
    });
    if (!patchRes.ok) {
      throw new Error(t("app.errorStatus", { status: String(patchRes.status) }));
    }
    const serverOffset = parseUploadOffset(patchRes.headers);
    offset = serverOffset > offset ? serverOffset : nextOffset;
  }

  const pathId = await findTusUploadedAttachmentPath(
    apiBaseUrl,
    authValue,
    file.name,
    file.size,
    options?.signal,
  );
  if (!pathId) {
    throw new Error("TUS: uploaded file not found in attachments");
  }

  return `/user_uploads/${pathId}`;
}

async function uploadFileMultipart(
  file: File,
  options?: { signal?: AbortSignal },
): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res =
    options?.signal != null
      ? await zulipApi.postFormData("/user_uploads", form, options.signal)
      : await zulipApi.postFormData("/user_uploads", form);
  if (!res.ok) {
    const data = res.data as { msg?: string };
    throw new Error(data.msg ?? t("app.errorStatus", { status: String(res.status) }));
  }
  return toUploadUri(res.data);
}

/** Uploads a file to Zulip. Uses TUS for large files and multipart fallback otherwise. */
export async function uploadFile(file: File, options?: { signal?: AbortSignal }): Promise<string> {
  ensureZulipApiReady();
  const instance = getCurrentInstance();
  if (!instance) {
    throw new Error(t("app.noInstance"));
  }
  const validation = validateFileUpload(file);
  if (!validation.valid) {
    throw new Error(validation.error ?? "File validation failed");
  }

  if (file.size > TUS_UPLOAD_THRESHOLD_BYTES) {
    try {
      return await uploadFileViaTus(file, instance, options);
    } catch (error) {
      if (isAbortError(error) || options?.signal?.aborted) {
        throw error;
      }
      // Keep compatibility on servers without TUS support.
      return uploadFileMultipart(file, options);
    }
  }

  return uploadFileMultipart(file, options);
}

/** Adds a flag to messages (e.g. "starred"). */
export async function addMessageFlag(messageIds: number[], flag: string): Promise<void> {
  await updateMessageFlags(messageIds, "add", flag);
}

/** Removes a flag from messages (e.g. unstar). */
export async function removeMessageFlag(messageIds: number[], flag: string): Promise<void> {
  await updateMessageFlags(messageIds, "remove", flag);
}
