// Реалтайм-очередь событий Zulip:
// register, poll, delete и загрузка unread count для credentials.
import { t } from "~/i18n/i18n";
import { getBasicAuthValue } from "~/shared/lib/auth-guard";
import { env } from "~/shared/lib/env";
import { isBadEventQueueIdResponse } from "~/shared/lib/zulip-event-queue-errors.lib";
import { getCurrentInstance, zulipApi } from "./client";
import {
  getAuthValueForCredentials,
  getValidatedCredentialsRealm,
} from "./zulip-credentials.internal";
import { createLongPollAbortSetup } from "./zulip-events-longpoll.lib";
import {
  zulipPipelineDelete,
  zulipPipelinePost,
  ensureZulipApiReady,
} from "./zulip-pipeline.internal";
import {
  buildRegisterQueueResult,
  parseRegisterQueueMetadata,
  toOwnAvatarCapabilities,
} from "./zulip-register-queue-result.lib";
import { parseUnreadDmMessagesCount, parseUnreadMessagesCount } from "./zulip-unread.lib";
import {
  buildUserTopicsCacheKey,
  getCachedUserTopicsForKey,
  getCurrentUserTopicsCacheKey,
  setCachedUserTopicsForKey,
} from "./zulip-user-topics.internal";
import { validateEventCursor, validateQueueId } from "./zulip-validation.internal";
import type {
  GetEventsResult,
  RegisterQueueResult,
  ZulipCredentials,
  ZulipOwnAvatarCapabilities,
  ZulipUserTopic,
} from "./zulip.types";

export { parseSubscriptions } from "./zulip-queue-parse-subscription.lib";

// Зачем: просим у Zulip только те metadata-секции, которые нужны для sidebar без загрузки больших пачек сообщений.
// `realm` — в т.ч. `server_thumbnail_formats` (размеры превью user_uploads), а `realm_user_groups` нужен для channel-level permission checks.
export const DEFAULT_REGISTER_FETCH_EVENT_TYPES = [
  "subscription",
  "user_topic",
  "recent_private_conversations",
  "realm",
  "realm_user_groups",
  "user_settings",
  "message",
  "update_message_flags",
] as const;
const REGISTER_CLIENT_CAPABILITIES = {
  notification_settings_null: true,
  bulk_message_deletion: true,
  user_avatar_url_field_optional: true,
  stream_typing_notifications: true,
  user_settings_object: true,
  archived_channels: true,
  empty_topic_name: true,
} as const;

let cachedOwnAvatarCapabilities: ZulipOwnAvatarCapabilities = {};

function setCachedOwnAvatarCapabilities(capabilities: ZulipOwnAvatarCapabilities): void {
  cachedOwnAvatarCapabilities = capabilities;
}

export function getCachedOwnAvatarCapabilities(): ZulipOwnAvatarCapabilities {
  return cachedOwnAvatarCapabilities;
}

// Регистрирует очередь событий и возвращает `queue_id`
// для дальнейшего long-polling.
export async function registerQueue(
  eventTypes: string[],
  fetchEventTypes: string[] = [...DEFAULT_REGISTER_FETCH_EVENT_TYPES],
): Promise<RegisterQueueResult> {
  const body: Record<string, string> = {
    event_types: JSON.stringify(eventTypes),
    apply_markdown: "false",
    // Что делает: просит сервер включать archived channels в register/events payload.
    client_capabilities: JSON.stringify(REGISTER_CLIENT_CAPABILITIES),
  };
  if (fetchEventTypes.length > 0) {
    // Зачем: Zulip вернет в register дополнительные metadata-блоки одним запросом.
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
    subscriptions?: unknown;
    user_topics?: unknown;
    recent_private_conversations?: unknown;
    realm_can_add_subscribers_group?: unknown;
    realm_can_resolve_topics_group?: unknown;
    realm_user_groups?: unknown;
    server_thumbnail_formats?: unknown;
    max_avatar_file_size_mib?: unknown;
    realm_avatar_changes_disabled?: unknown;
    server_avatar_changes_disabled?: unknown;
    user_settings?: unknown;
    unread_msgs?: unknown;
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

  const metadata = parseRegisterQueueMetadata(data);
  setCachedOwnAvatarCapabilities(toOwnAvatarCapabilities(metadata));
  const cacheKey = getCurrentUserTopicsCacheKey();
  if (cacheKey && metadata.userTopics) {
    setCachedUserTopicsForKey(cacheKey, metadata.userTopics);
  }

  return buildRegisterQueueResult(
    {
      queue_id: data.queue_id,
      last_event_id: data.last_event_id,
      event_queue_longpoll_timeout_seconds: data.event_queue_longpoll_timeout_seconds,
    },
    metadata,
  );
}

// Регистрирует очередь с явными credentials.
// Используется для фоновых multi-org loop.
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
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: authValue,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        event_types: JSON.stringify(eventTypes),
        apply_markdown: "false",
        client_capabilities: JSON.stringify(REGISTER_CLIENT_CAPABILITIES),
        // Для фоновых инстансов payload сообщений не рендерится в UI,
        // поэтому HTML от backend здесь не нужен.
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
    subscriptions?: unknown;
    user_topics?: unknown;
    recent_private_conversations?: unknown;
    realm_can_add_subscribers_group?: unknown;
    realm_can_resolve_topics_group?: unknown;
    realm_user_groups?: unknown;
    server_thumbnail_formats?: unknown;
    max_avatar_file_size_mib?: unknown;
    realm_avatar_changes_disabled?: unknown;
    server_avatar_changes_disabled?: unknown;
    user_settings?: unknown;
    unread_msgs?: unknown;
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

  const metadata = parseRegisterQueueMetadata(data);
  setCachedOwnAvatarCapabilities(toOwnAvatarCapabilities(metadata));
  setCachedUserTopicsForKey(
    buildUserTopicsCacheKey(credentials.realm, credentials.email),
    metadata.userTopics ?? [],
  );

  return buildRegisterQueueResult(
    {
      queue_id: data.queue_id,
      last_event_id: data.last_event_id,
      event_queue_longpoll_timeout_seconds: data.event_queue_longpoll_timeout_seconds,
    },
    metadata,
  );
}

// Удаляет очередь событий.
// Это best-effort cleanup при logout или переключении инстанса, поэтому ошибки глотаются.
// Credentials нужно передавать явно при cleanup во время instance switch,
// потому что `getCurrentInstance()` уже мог смениться.
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
    // Best-effort cleanup.
  }
}

const UNREAD_ONLY_NARROW = [{ operator: "is", operand: "unread" }] as const;
const UNREAD_DM_NARROW = [
  { operator: "is", operand: "unread" },
  { operator: "is", operand: "dm" },
] as const;

// Читает число непрочитанных по заданному narrow для любых instance credentials.
async function fetchUnreadMessagesCountForCredentialsWithNarrow(
  credentials: ZulipCredentials,
  narrow: readonly { operator: string; operand: string }[],
  contextLabel: string,
  options?: { signal?: AbortSignal },
  parseCount: (payload: unknown) => number | null = parseUnreadMessagesCount,
): Promise<number | null> {
  let base: string;
  try {
    base = getValidatedCredentialsRealm(credentials, contextLabel);
  } catch {
    return null;
  }
  const url = new URL(`${base}${env.ZULIP_API_PATH}/messages`);
  url.searchParams.set("anchor", "newest");
  url.searchParams.set("num_before", "5000");
  url.searchParams.set("num_after", "0");
  url.searchParams.set("narrow", JSON.stringify(narrow));
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
    return parseCount(payload);
  } catch {
    return null;
  }
}

// Читает общее число непрочитанных сообщений для любых instance credentials.
// Если запрос упал или payload не удалось распарсить, возвращает null.
export async function fetchUnreadMessagesCountForCredentials(
  credentials: ZulipCredentials,
  options?: { signal?: AbortSignal },
): Promise<number | null> {
  return fetchUnreadMessagesCountForCredentialsWithNarrow(
    credentials,
    UNREAD_ONLY_NARROW,
    "fetchUnreadMessagesCountForCredentials",
    options,
  );
}

/** Unread direct messages only (personal chats) for inactive-instance app icon badges. */
export async function fetchUnreadDmMessagesCountForCredentials(
  credentials: ZulipCredentials,
  options?: { signal?: AbortSignal },
): Promise<number | null> {
  return fetchUnreadMessagesCountForCredentialsWithNarrow(
    credentials,
    UNREAD_DM_NARROW,
    "fetchUnreadDmMessagesCountForCredentials",
    options,
    parseUnreadDmMessagesCount,
  );
}

// Делает long-poll за событиями.
// Поддерживает timeout и `AbortSignal`.
export async function getEvents(
  queueId: string,
  lastEventId: number,
  options?: { timeoutSec?: number; signal?: AbortSignal },
): Promise<GetEventsResult> {
  const safeQueueId = validateQueueId(queueId, "getEvents");
  const safeLastEventId = validateEventCursor(lastEventId, "getEvents");
  ensureZulipApiReady();

  const { signal, cleanup } = createLongPollAbortSetup(options);

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
    if (isBadEventQueueIdResponse(data)) {
      return data;
    }
    return data;
  } catch (e) {
    cleanup();
    throw e;
  }
}

// Делает long-poll за событиями с явными credentials.
// Используется для фоновых multi-org loop.
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

  const { signal, cleanup } = createLongPollAbortSetup(options);

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: authValue,
      },
      signal,
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

// Legacy accessor `user_topic` из in-memory register cache.
// Нужен для обратной совместимости старых мест вызова,
// которые еще не используют bootstrap-пайплайн.
export function fetchUserTopics(): Promise<ZulipUserTopic[]> {
  const cacheKey = getCurrentUserTopicsCacheKey();
  if (!cacheKey) {
    return Promise.resolve([]);
  }
  return Promise.resolve(getCachedUserTopicsForKey(cacheKey));
}
