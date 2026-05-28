// Основной API-слой для работы с Zulip (очереди, unread, сообщения, флаги, профили и т.д.).
// Клиент Zulip API через `zulip-js`.
//
// Использует текущий выбранный инстанс из `instancesStore`.
// Клиент кэшируется по `instanceId`, чтобы не делать лишние handshakes.
// Поддерживает и Basic auth через `email:apiKey`, и cookie session auth.
//
// Использование:
//   import { fetchStreams, fetchMessages, sendMessage, registerQueue } from "~/shared/api/zulip";
import { Buffer } from "buffer";
import zulipInitDefault from "zulip-js";
import { t } from "~/i18n/i18n";
import { STREAM_SIDEBAR_TOPIC_HYDRATE_LIMIT } from "~/shared/config/metadata-chat-bootstrap.constants";
import { env } from "~/shared/lib/env";
import { guard, invariant } from "~/shared/lib/guards";
import {
  logChatListFlow,
  summarizeZulipMessagesForFlowDebug,
} from "~/shared/lib/message-flow-debug.lib";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import { isValidEmail, isValidRealmUrl } from "~/shared/lib/validation";
import { normalizeGroupSettingValue } from "~/shared/lib/zulip-group-setting.lib";
import {
  ZULIP_DM_CHAT_NUM_AFTER,
  ZULIP_DM_CHAT_NUM_BEFORE,
  ZULIP_STREAM_CHAT_NUM_AFTER,
  ZULIP_STREAM_CHAT_NUM_BEFORE,
} from "~/shared/lib/zulip-message-window.lib";
import { buildStreamSidebarPreviewNarrow } from "~/shared/lib/zulip-stream-sidebar-preview-narrow.lib";
import {
  normalizeZulipMessagesNarrowForApi,
  zulipTopicNarrowOperandForApi,
} from "~/shared/lib/zulip-topic-narrow.lib";
import {
  getCurrentInstance,
  refreshWorkspaceApiBase,
  refreshZulipApiBase,
  zulipApi,
} from "./client";
import { parseCurrentUserFromApiData } from "./zulip-current-user.lib";
import { mockMessageFromGetMessageApiData, rawMessageToMockMessage } from "./zulip-message-map.lib";
import {
  getCachedUserTopicsForKey,
  getCurrentUserTopicsCacheKey,
} from "./zulip-user-topics.internal";
import { validateMessageIds } from "./zulip-validation.internal";
import type { ReactionType, RealmEmoji } from "./zulip.types";

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
        throwIfZulipPipelineGetNull(res);
        if (!res.ok) {
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

// Realm base URL без API path. Используется для абсолютных URL, например для аватаров и uploads.
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

export type { ZulipRecentPrivateConversation } from "./zulip.types";

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

function resolveRealmRelativeUrl(path: string): string {
  const normalizedPath = path.trim();
  if (!normalizedPath) {
    return "";
  }
  if (normalizedPath.startsWith("http://") || normalizedPath.startsWith("https://")) {
    return normalizedPath;
  }
  const base = getRealmBaseUrl();
  if (!base) {
    return "";
  }
  return `${base}${normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`}`;
}

// Загружает server settings без авторизации.
// Используется на странице логина, чтобы показать иконку realm, имя и auth-методы.
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

// Обменивает credentials на API key.
// Используется на логине; пароль никогда не сохраняется.
// Бросает `ZulipAuthError` при auth- или network-сбое.
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

// Завершает OIDC desktop flow, обменивая расшифрованный login token
// на `/accounts/login/subdomain/<token>`.
//
// Backend может либо сразу вернуть API credentials,
// либо поднять cookie-based session auth.
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
  signal?: AbortSignal,
): Promise<{ ok: boolean; status: number; data: unknown } | null> {
  try {
    ensureZulipApiReady();
    const response =
      signal == null
        ? await zulipApi.get(normalizeApiPath(path), params)
        : await zulipApi.get(normalizeApiPath(path), params, signal);
    return {
      ok: response.ok,
      status: response.status,
      data: response.data,
    };
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) {
      throw error;
    }
    return null;
  }
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

// `zulipPipelineGet` возвращает null при сетевой ошибке, если это не abort.
// Message loader'ы должны бросать ошибку, чтобы вызывающий код показал ее пользователю,
// а не принял пустой список за успешный ответ.
function throwIfZulipPipelineGetNull(
  response: { ok: boolean; status: number; data: unknown } | null,
  signal?: AbortSignal,
): asserts response is { ok: boolean; status: number; data: unknown } {
  if (response != null) return;
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  throw new Error("Zulip request failed");
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

export type { GetEventsResult, ZulipCredentials, ZulipEvent } from "./zulip.types";

export {
  DEFAULT_REGISTER_FETCH_EVENT_TYPES,
  deleteQueue,
  fetchUnreadDmMessagesCountForCredentials,
  fetchUnreadMessagesCountForCredentials,
  getEvents,
  getEventsForCredentials,
  registerQueue,
  registerQueueForCredentials,
} from "./zulip-queue";

export {
  markDmAsRead,
  markMessagesAsRead,
  markStreamAsRead,
  markTopicAsRead,
  setTopicResolvedState,
} from "./zulip-read-state";

export { uploadFile } from "./zulip-upload";

export interface ZulipCurrentUser {
  user_id: number;
  full_name: string;
  email: string;
}

export async function getCurrentUser(): Promise<ZulipCurrentUser | null> {
  const res = await zulipPipelineGet("/users/me");
  if (!res?.ok) {
    return null;
  }
  return parseCurrentUserFromApiData(res.data);
}

// Карта `user_id -> relative avatar_url`.
export type AvatarUrlByUserId = Map<number, string>;

// Одна запись пользователя из `GET /users`.
export interface ZulipUserMember {
  user_id: number;
  full_name?: string;
  email?: string;
  avatar_url?: string | null;
  role?: number;
  /** Zulip: `false` когда аккаунт деактивирован. */
  is_active?: boolean;
  // Присутствует, когда включен `include_custom_profile_fields=true`.
  profile_data?: Record<string, { value?: string; rendered_value?: string }>;
}

// Загружает полный список пользователей для заполнения `usersStore`.
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

// Загружает одного пользователя по ID. Используется в DM profile panel.
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

// Формат ответа `GET /api/v1/realm/presence`, где ключом выступает email пользователя.
export interface RealmPresenceEntry {
  aggregated?: { status: string; timestamp: number };
  website?: { status: string; timestamp: number };
}

export interface RealmPresenceResponse {
  result?: string;
  presences?: Record<string, RealmPresenceEntry>;
  server_timestamp?: number;
}

// Загружает presence-данные для всех пользователей.
export async function fetchRealmPresence(): Promise<RealmPresenceResponse> {
  const res = await zulipPipelineGet("/realm/presence");
  if (!res?.ok) {
    return { result: "error" };
  }
  return res.data as RealmPresenceResponse;
}

// Загружает кастомные emoji организации в формате, совместимом с emoji-picker-react.
export async function fetchRealmEmojis(): Promise<RealmEmoji[]> {
  const res = await zulipPipelineGet("/realm/emoji");
  if (!res?.ok) {
    return [];
  }
  const data = res.data as {
    result?: string;
    emoji?: Record<
      string,
      {
        id?: string | number;
        name?: string;
        source_url?: string;
        deactivated?: boolean;
      }
    >;
  };
  if (data.result === "error") {
    return [];
  }
  if (data.emoji == null || typeof data.emoji !== "object" || Array.isArray(data.emoji)) {
    return [];
  }

  const normalized: RealmEmoji[] = [];
  for (const value of Object.values(data.emoji)) {
    if (typeof value !== "object" || value == null) {
      continue;
    }
    if (value.deactivated === true) {
      continue;
    }
    const id =
      typeof value.id === "string"
        ? value.id.trim()
        : typeof value.id === "number"
          ? String(value.id)
          : "";
    const name = typeof value.name === "string" ? value.name.trim() : "";
    const sourceUrl = typeof value.source_url === "string" ? value.source_url.trim() : "";
    if (!id || !name || !sourceUrl) {
      continue;
    }
    const imgUrl = resolveRealmRelativeUrl(sourceUrl);
    if (!imgUrl) {
      continue;
    }
    normalized.push({
      id,
      names: [name],
      imgUrl,
    });
  }
  return normalized;
}

// Загружает пользователей и возвращает карту `user_id -> avatar_url`.
// Для кэширования предпочтительнее использовать `fetchUsers()` вместе с `usersStore`;
// это просто удобный shortcut.
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

// Одна реакция на сообщение в формате Zulip API.
export interface Reaction {
  emoji_name: string;
  emoji_code: string;
  reaction_type: "unicode_emoji" | "realm_emoji" | "zulip_extra_emoji";
  user_id: number;
}

// Raw-сообщение из `GET /messages`.
// Отсутствие `read` в flags означает, что сообщение непрочитано.
export interface ZulipRawMessage {
  id: number;
  sender_id: number;
  sender_full_name?: string;
  // Аватар отправителя в виде относительного пути.
  // Присутствует в ответе `GET /messages`.
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
  applyMarkdown?: boolean;
  signal?: AbortSignal;
  // Если поле задано и включен `CHAT_LIST_FLOW_DEBUG`,
  // логирует запрос и ответ `GET /messages` для bootstrap sidebar.
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
  const {
    anchor,
    numBefore,
    numAfter,
    includeAnchor,
    narrow,
    applyMarkdown = false,
    signal,
    flowDebugLabel,
  } = options;
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  if (flowDebugLabel != null) {
    logChatListFlow(`api: GET /messages → ${flowDebugLabel} (request)`, {
      anchor,
      numBefore,
      numAfter,
      includeAnchor: includeAnchor ?? null,
      hasNarrow: narrow != null,
      applyMarkdown,
    });
  }
  const res = await zulipPipelineGet(
    "/messages",
    {
      anchor: String(anchor),
      ...(includeAnchor == null ? {} : { include_anchor: includeAnchor ? "true" : "false" }),
      num_before: String(numBefore),
      num_after: String(numAfter),
      ...(narrow == null ? {} : { narrow: JSON.stringify(narrow) }),
      client_gravatar: "true",
      allow_empty_topic_name: "true",
      apply_markdown: applyMarkdown ? "true" : "false",
    },
    signal,
  );
  throwIfZulipPipelineGetNull(res, signal);
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  if (!res.ok) {
    if (flowDebugLabel != null) {
      logChatListFlow(`api: GET /messages → ${flowDebugLabel} (non-ok)`, { ok: false });
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

// Загружает последние сообщения без narrow (default 1000) для sidebar bootstrap fallback.
export async function fetchRecentMessages(numBefore = 1000): Promise<ZulipRawMessage[]> {
  return fetchMessageWindow({
    anchor: "newest",
    numBefore,
    numAfter: 0,
    applyMarkdown: false,
    flowDebugLabel: "fetchRecentMessages (chat list bootstrap / reconnect fallback)",
  });
}

/** Recent channel messages only (`-is:dm`) for metadata-first stream sidebar preview. */
export async function fetchRecentStreamMessagesForSidebarPreview(
  numBefore = 5000,
  signal?: AbortSignal,
): Promise<ZulipRawMessage[]> {
  const safeNumBefore = validateNonNegativeInteger(
    numBefore,
    "fetchRecentStreamMessagesForSidebarPreview.numBefore",
  );
  return fetchMessageWindow({
    anchor: "newest",
    numBefore: safeNumBefore,
    numAfter: 0,
    narrow: normalizeZulipMessagesNarrowForApi(buildStreamSidebarPreviewNarrow(false)),
    applyMarkdown: false,
    signal,
    flowDebugLabel: "fetchRecentStreamMessagesForSidebarPreview (metadata stream preview)",
  });
}

/** Recent messages in one channel for lazy sidebar topic previews. */
export async function fetchStreamChannelMessagesForSidebarTopics(
  streamId: number,
  numBefore = STREAM_SIDEBAR_TOPIC_HYDRATE_LIMIT,
  signal?: AbortSignal,
): Promise<ZulipRawMessage[]> {
  guard.streamId(streamId, "fetchStreamChannelMessagesForSidebarTopics");
  const safeNumBefore = validateNonNegativeInteger(
    numBefore,
    "fetchStreamChannelMessagesForSidebarTopics.numBefore",
  );
  return fetchMessageWindow({
    anchor: "newest",
    numBefore: safeNumBefore,
    numAfter: ZULIP_STREAM_CHAT_NUM_AFTER,
    narrow: [{ operator: "stream", operand: streamId }],
    applyMarkdown: false,
    signal,
    flowDebugLabel: "fetchStreamChannelMessagesForSidebarTopics (sidebar topic hydrate)",
  });
}

/** Unread channel messages only (`is:unread` + `-is:dm`) for metadata-first stream sidebar preview. */
export async function fetchStreamUnreadMessagesForSidebarPreview(
  numBefore = 5000,
  signal?: AbortSignal,
): Promise<ZulipRawMessage[] | null> {
  const safeNumBefore = validateNonNegativeInteger(
    numBefore,
    "fetchStreamUnreadMessagesForSidebarPreview.numBefore",
  );
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  const res = await zulipPipelineGet(
    "/messages",
    {
      anchor: "newest",
      num_before: String(safeNumBefore),
      num_after: "0",
      narrow: JSON.stringify(
        normalizeZulipMessagesNarrowForApi(buildStreamSidebarPreviewNarrow(true)),
      ),
      client_gravatar: "true",
      allow_empty_topic_name: "true",
      apply_markdown: "false",
    },
    signal,
  );
  if (!res?.ok) {
    return null;
  }
  const data = res.data as { result?: string; messages?: ZulipRawMessage[] };
  if (!data || data.result === "error") {
    return null;
  }
  return data.messages ?? [];
}

// Загружает более старые сообщения chat-list до anchor.
// Используется для глубокого backfill на bootstrap.
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
    applyMarkdown: false,
    flowDebugLabel: "fetchMessagesBeforeAnchor (chat list deep history)",
  });
}

// Загружает более новые сообщения chat-list после anchor.
// Используется после reconnect.
export async function fetchMessagesAfterAnchor(
  anchorMessageId: number,
  numAfter = 5000,
  narrow?: MessageWindowOptions["narrow"],
  signal?: AbortSignal,
): Promise<ZulipRawMessage[]> {
  guard.messageId(anchorMessageId, "fetchMessagesAfterAnchor.anchorMessageId");
  return fetchMessageWindow({
    anchor: anchorMessageId,
    numBefore: 0,
    numAfter,
    includeAnchor: false,
    narrow,
    applyMarkdown: false,
    signal,
    flowDebugLabel: "fetchMessagesAfterAnchor (chat list delta / reconnect)",
  });
}

// Загружает authoritative unread snapshot для reconcile счетчиков sidebar.
// Возвращает `null`, если запрос не удался, чтобы caller не обнулил unread по сетевой ошибке.
export async function fetchUnreadMessagesSnapshot(
  numBefore = 5000,
): Promise<ZulipRawMessage[] | null> {
  // Что делает: `null` здесь означает ошибку запроса, а не "unread на сервере нет".
  // Зачем: caller не должен обнулять бейджи по временной сетевой ошибке или bad payload.
  const safeNumBefore = validateNonNegativeInteger(
    numBefore,
    "fetchUnreadMessagesSnapshot.numBefore",
  );
  const res = await zulipPipelineGet("/messages", {
    anchor: "newest",
    num_before: String(safeNumBefore),
    num_after: "0",
    narrow: JSON.stringify([{ operator: "is", operand: "unread" }]),
    client_gravatar: "true",
    allow_empty_topic_name: "true",
    apply_markdown: "false",
  });
  if (!res?.ok) {
    return null;
  }
  const data = res.data as { result?: string; messages?: ZulipRawMessage[] };
  if (!data || data.result === "error") {
    return null;
  }
  return data.messages ?? [];
}

export interface DirectMessagesPageResult {
  messages: ZulipRawMessage[];
  foundOldest: boolean;
}

// Загружает страницу по всем direct message через `narrow=is:dm`
// для metadata backfill.
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
    apply_markdown: "false",
  });
  throwIfZulipPipelineGetNull(res);
  if (!res.ok) {
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

// Загружает сообщения для раздела "Моя активность":
// starred, mentions и reactions.
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
  throwIfZulipPipelineGetNull(res);
  if (!res.ok) return { messages: [], foundOldest: false };
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
  // Raw Markdown для редактирования и цитирования,
  // когда API отдает его явно.
  markdown_source?: string;
  timestamp: number;
  // Флаги из API, например `read` или `mentioned`.
  // Если `read` отсутствует, сообщение считается непрочитанным.
  flags?: string[];
  reactions?: Reaction[];
  // Локальный delivery state для optimistic outgoing сообщений.
  delivery_status?: MockMessageDeliveryStatus;
  // Стабильный клиентский ключ для reconciliation в списке.
  // Пока сообщение optimistic, это отрицательный id.
  // После получения положительного id от сервера ключ сохраняется.
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
  is_archived?: boolean;
  creator_id?: number;
  invite_only?: boolean;
  can_add_subscribers_group?: number | { direct_members: number[]; direct_subgroups: number[] };
  can_remove_subscribers_group?: number | { direct_members: number[]; direct_subgroups: number[] };
  can_administer_channel_group?: number | { direct_members: number[]; direct_subgroups: number[] };
}

// Загружает подписки пользователя, включая `is_muted` по каждому стриму.
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
      is_archived?: boolean;
      in_home_view?: boolean;
      creator_id?: unknown;
      invite_only?: boolean;
      can_add_subscribers_group?: unknown;
      can_remove_subscribers_group?: unknown;
      can_administer_channel_group?: unknown;
    }[];
  };
  // Что делает: возвращает нормализованные подписки с channel-level permission metadata.
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
    };
  });
}

// Legacy accessor `user_topic` из in-memory register cache.
// Нужен для обратной совместимости старых вызовов,
// где нет прямого доступа к register snapshot.
export function fetchUserTopics(): Promise<ZulipUserTopic[]> {
  const cacheKey = getCurrentUserTopicsCacheKey();
  if (!cacheKey) {
    return Promise.resolve([]);
  }
  return Promise.resolve(getCachedUserTopicsForKey(cacheKey));
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
  options?: { signal?: AbortSignal },
): Promise<MockMessage[]> {
  const normalizedStream =
    stream == null ? undefined : guard.nonEmpty(stream, "fetchMessages.stream");
  const normalizedTopic = topic == null ? undefined : normalizeTopicForIdentity(topic);
  if (normalizedTopic !== undefined && normalizedStream === undefined) {
    throw new Error("fetchMessages.stream is required when topic is provided");
  }
  const narrow: MessagesApiNarrow[] = [];
  if (normalizedStream) narrow.push({ operator: "stream", operand: normalizedStream });
  if (normalizedTopic !== undefined) {
    narrow.push({ operator: "topic", operand: zulipTopicNarrowOperandForApi(normalizedTopic) });
  }
  if (q?.trim()) narrow.push({ operator: "search", operand: q.trim() });
  const page = await fetchMessagesWithNarrowPage(
    narrow,
    "newest",
    ZULIP_STREAM_CHAT_NUM_BEFORE,
    ZULIP_STREAM_CHAT_NUM_AFTER,
    { ...options, applyMarkdown: false },
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
  applyMarkdown = false,
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
    applyMarkdown,
  });
}

// Что делает: нормализует payload страницы сообщений к единому виду.
// Зачем: одинаковая обработка результатов для путей с сигналом и без него.
function toMessagesPageResultFromRaw(data: {
  result?: string;
  messages?: Parameters<typeof mapZulipMessage>[0][];
  found_oldest?: boolean;
  foundOldest?: boolean;
  found_newest?: boolean;
  foundNewest?: boolean;
}): MessagesPageResult {
  if (data.result === "error") {
    return { messages: [], foundOldest: false, foundNewest: false };
  }
  return {
    messages: (data.messages ?? []).map(mapZulipMessage),
    foundOldest: data.found_oldest ?? data.foundOldest ?? false,
    foundNewest: data.found_newest ?? data.foundNewest ?? false,
  };
}

// Что делает: исполняет запрос страницы сообщений в abortable/regular режимах.
// Зачем: сохранить совместимость старого client-path и добавить реальную отмену через signal.
async function runMessagesWithNarrowPageRequest(options: {
  narrow: MessagesApiNarrow[];
  anchor: string | number;
  numBefore: number;
  numAfter: number;
  applyMarkdown?: boolean;
  signal?: AbortSignal;
}): Promise<MessagesPageResult> {
  const { narrow, anchor, numBefore, numAfter, applyMarkdown = false, signal } = options;
  try {
    if (signal) {
      const query = buildMessagesQueryParams({
        narrow: narrow.length > 0 ? narrow : undefined,
        anchor,
        num_before: numBefore,
        num_after: numAfter,
      });
      query.apply_markdown = applyMarkdown ? "true" : "false";
      const response = await zulipPipelineGet("/messages", query, signal);
      throwIfZulipPipelineGetNull(response, signal);
      if (!response.ok) {
        throw new Error(t("app.errorStatus", { status: String(response.status) }));
      }
      const data = response.data as {
        result?: string;
        messages?: Parameters<typeof mapZulipMessage>[0][];
        found_oldest?: boolean;
        foundOldest?: boolean;
        found_newest?: boolean;
        foundNewest?: boolean;
      };
      if (signal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      return toMessagesPageResultFromRaw(data);
    }

    const client = await getClient();
    const data = (await client.messages.retrieve({
      narrow: narrow.length > 0 ? narrow : undefined,
      anchor,
      num_before: numBefore,
      num_after: numAfter,
      apply_markdown: applyMarkdown,
    })) as {
      result?: string;
      messages?: Parameters<typeof mapZulipMessage>[0][];
      found_oldest?: boolean;
      foundOldest?: boolean;
      found_newest?: boolean;
      foundNewest?: boolean;
    };
    return toMessagesPageResultFromRaw(data);
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) {
      throw error;
    }
    if (signal) {
      throw error instanceof Error ? error : new Error(t("app.networkError"));
    }
    return { messages: [], foundOldest: false, foundNewest: false };
  }
}

// Универсальная загрузка сообщений по narrow с настраиваемыми anchor и лимитами.
export async function fetchMessagesWithNarrow(
  narrow: MessagesApiNarrow[],
  anchor: string | number = "newest",
  numBefore = ZULIP_STREAM_CHAT_NUM_BEFORE,
  numAfter = ZULIP_STREAM_CHAT_NUM_AFTER,
  options?: { signal?: AbortSignal; applyMarkdown?: boolean },
): Promise<MockMessage[]> {
  const page = await fetchMessagesWithNarrowPage(narrow, anchor, numBefore, numAfter, options);
  return page.messages;
}

export interface MessagesPageResult {
  messages: MockMessage[];
  foundOldest: boolean;
  foundNewest: boolean;
}

// Универсальная загрузка страницы сообщений по narrow с метаданными пагинации.
export async function fetchMessagesWithNarrowPage(
  narrow: MessagesApiNarrow[],
  anchor: string | number = "newest",
  numBefore = ZULIP_STREAM_CHAT_NUM_BEFORE,
  numAfter = ZULIP_STREAM_CHAT_NUM_AFTER,
  options?: { signal?: AbortSignal; applyMarkdown?: boolean },
): Promise<MessagesPageResult> {
  const validatedAnchor = validateMessagesApiAnchor(anchor, "fetchMessagesWithNarrowPage");
  const validatedNumBefore = validateNonNegativeInteger(numBefore, "numBefore");
  const validatedNumAfter = validateNonNegativeInteger(numAfter, "numAfter");
  const apiNarrow = normalizeZulipMessagesNarrowForApi(narrow);
  if (options?.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  // Что делает: abortable-запросы не делят общий in-flight promise.
  // Зачем: отмена одного route-запроса не должна влиять на другой.
  if (options?.signal) {
    const direct = await runMessagesWithNarrowPageRequest({
      narrow: apiNarrow,
      anchor: validatedAnchor,
      numBefore: validatedNumBefore,
      numAfter: validatedNumAfter,
      applyMarkdown: options?.applyMarkdown,
      signal: options.signal,
    });
    if (options.signal.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    return direct;
  }
  const requestKey = buildMessagesPageInFlightKey(
    apiNarrow,
    validatedAnchor,
    validatedNumBefore,
    validatedNumAfter,
    options?.applyMarkdown,
  );
  const inFlight = messagesPageInFlight.get(requestKey);
  if (inFlight) {
    return inFlight;
  }

  const request = runMessagesWithNarrowPageRequest({
    narrow: apiNarrow,
    anchor: validatedAnchor,
    numBefore: validatedNumBefore,
    numAfter: validatedNumAfter,
    applyMarkdown: options?.applyMarkdown,
  });

  messagesPageInFlight.set(requestKey, request);
  return request.finally(() => {
    if (messagesPageInFlight.get(requestKey) === request) {
      messagesPageInFlight.delete(requestKey);
    }
  });
}

// Загружает страницу всех сообщений без narrow через API pipeline.
export async function fetchAllMessagesPage(
  anchor: string | number = "newest",
  numBefore = 100,
  options?: { applyMarkdown?: boolean },
): Promise<MessagesPageResult> {
  const validatedAnchor = validateMessagesApiAnchor(anchor, "fetchAllMessagesPage");
  const validatedNumBefore = validateNonNegativeInteger(numBefore, "numBefore");
  const applyMarkdown = options?.applyMarkdown ?? false;
  const res = await zulipPipelineGet("/messages", {
    anchor: String(validatedAnchor),
    num_before: String(validatedNumBefore),
    num_after: "0",
    narrow: "[]",
    allow_empty_topic_name: "true",
    client_gravatar: "true",
    apply_markdown: applyMarkdown ? "true" : "false",
  });

  throwIfZulipPipelineGetNull(res);
  if (!res.ok) {
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

// Формат DM narrow: `operand` — массив `user_id` участников, например `[427]`.
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

// Что делает: исполняет DM-запрос в abortable/regular режимах.
// Зачем: на signal-пути нужна реальная отмена, но legacy-путь с дедупликацией должен сохраниться.
async function runDmMessagesRequest(ids: number[], signal?: AbortSignal): Promise<MockMessage[]> {
  try {
    if (signal) {
      const response = await zulipPipelineGet(
        "/messages",
        buildMessagesQueryParams({
          narrow: [{ negated: false, operator: "dm", operand: ids }] as DmNarrow[],
          anchor: "newest",
          num_before: ZULIP_DM_CHAT_NUM_BEFORE,
          num_after: ZULIP_DM_CHAT_NUM_AFTER,
        }),
        signal,
      );
      throwIfZulipPipelineGetNull(response, signal);
      if (!response.ok) {
        throw new Error(t("app.errorStatus", { status: String(response.status) }));
      }
      const data = response.data as {
        result?: string;
        messages?: Parameters<typeof mapZulipMessage>[0][];
      };
      if (data.result === "error") return [];
      if (signal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      return (data.messages ?? []).map(mapZulipMessage);
    }

    const params = {
      narrow: [{ negated: false, operator: "dm", operand: ids }] as DmNarrow[],
      anchor: "newest",
      num_before: ZULIP_DM_CHAT_NUM_BEFORE,
      num_after: ZULIP_DM_CHAT_NUM_AFTER,
      client_gravatar: true,
      allow_empty_topic_name: true,
      apply_markdown: true,
    };
    const client = await getClient();
    const data = await client.messages.retrieve(params);
    const raw = data as { result?: string; messages?: Parameters<typeof mapZulipMessage>[0][] };
    if (raw.result === "error") return [];
    return (raw.messages ?? []).map(mapZulipMessage);
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) {
      throw error;
    }
    if (signal) {
      throw error instanceof Error ? error : new Error(t("app.networkError"));
    }
    return [];
  }
}

// Загружает сообщения DM, то есть 1:1 или групповые.
// Для 1:1 передайте id собеседника.
export async function fetchDmMessages(
  userIds: number | number[],
  options?: { signal?: AbortSignal },
): Promise<MockMessage[]> {
  const rawIds = Array.isArray(userIds) ? userIds : [userIds];
  if (rawIds.length === 0) return [];
  const validatedIds = rawIds.map((userId, index) =>
    guard.userId(userId, `fetchDmMessages.userIds[${index}]`),
  );
  const ids = Array.from(new Set(validatedIds)).sort((a, b) => a - b);
  if (ids.some((id) => id >= GROUP_DM_ID_OFFSET)) return [];

  const requestKey = buildDmMessagesInFlightKey(ids);
  if (options?.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  if (options?.signal) {
    return runDmMessagesRequest(ids, options.signal);
  }
  const inFlight = dmMessagesInFlight.get(requestKey);
  if (inFlight) {
    return inFlight;
  }

  const request = runDmMessagesRequest(ids);

  dmMessagesInFlight.set(requestKey, request);
  return request.finally(() => {
    if (dmMessagesInFlight.get(requestKey) === request) {
      dmMessagesInFlight.delete(requestKey);
    }
  });
}

// Загружает одно сообщение по id.
// Возвращает null, если ответ не `ok` или сервер вернул ошибку.
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

// Загружает id подписчиков стрима.
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

/** Loads topic names for a stream id (used for sidebar expand topic list). */
export async function fetchStreamTopicNames(streamId: number): Promise<string[]> {
  guard.streamId(streamId, "fetchStreamTopicNames.streamId");
  const client = await getClient();
  const data = await client.streams.topics.retrieve({ stream_id: streamId });
  return (data.topics ?? []).map((t) => t.name);
}

export interface SendMessageParams {
  // Для stream message: имя стрима. Если используется `to` для private, поле опускается.
  stream?: string;
  // Необязательный stream ID для более точного optimistic payload.
  streamId?: number;
  subject?: string;
  content: string;
  sender_id?: number;
  sender_full_name?: string;
  // Для private/DM message: id получателей. Если поле задано, `stream` игнорируется.
  to?: number[];
}

// Загружает saved snippets текущего пользователя.
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

// Создает saved snippet.
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
  const subject = params.subject ?? "";
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

// Рендерит markdown через Zulip для preview в composer.
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

// Обновляет метаданные стрима.
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
    body.is_archived = params.isArchived ? "true" : "false";
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

// Удаляет стрим.
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

// Обновляет содержимое сообщения.
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

// Удаляет сообщение.
export async function deleteMessage(messageId: number): Promise<void> {
  guard.messageId(messageId, "deleteMessage");
  const res = await zulipPipelineDelete(`messages/${messageId}`);
  if (!res.ok) {
    const data = res.data as { msg?: string };
    throw new Error(data.msg ?? t("app.errorStatus", { status: String(res.status) }));
  }
}

// Добавляет реакцию к сообщению.
export async function addReaction(
  messageId: number,
  emojiName: string,
  options?: ReactionType | { emojiCode?: string; reactionType?: ReactionType },
): Promise<void> {
  guard.messageId(messageId, "addReaction");
  const normalizedEmojiName = guard.nonEmpty(emojiName, "addReaction.emojiName");
  const normalizedOptions =
    typeof options === "string" ? { reactionType: options } : (options ?? undefined);
  const reactionType = normalizedOptions?.reactionType ?? "unicode_emoji";
  const body: Record<string, string> = {
    emoji_name: normalizedEmojiName,
    reaction_type: reactionType,
  };
  if (normalizedOptions?.emojiCode) {
    body.emoji_code = normalizedOptions.emojiCode;
  }
  const res = await zulipPipelinePost(`messages/${messageId}/reactions`, body);
  if (!res.ok) {
    const data = res.data as { msg?: string; code?: string };
    if (data.code === "REACTION_ALREADY_EXISTS") return;
    throw new Error(data.msg ?? t("app.errorStatus", { status: String(res.status) }));
  }
}

// Удаляет реакцию из сообщения.
export async function removeReaction(
  messageId: number,
  emojiName: string,
  options?: { emojiCode?: string; reactionType?: ReactionType },
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

// Добавляет или удаляет флаг у сообщений.
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

// Добавляет флаг сообщениям, например `starred`.
export async function addMessageFlag(messageIds: number[], flag: string): Promise<void> {
  await updateMessageFlags(messageIds, "add", flag);
}

// Удаляет флаг у сообщений, например снимает `starred`.
export async function removeMessageFlag(messageIds: number[], flag: string): Promise<void> {
  await updateMessageFlags(messageIds, "remove", flag);
}
