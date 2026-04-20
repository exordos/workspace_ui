/**
 * Zulip real-time event queue: register, poll, delete; unread count for credentials.
 */
import { t } from "~/i18n/i18n";
import { getBasicAuthValue } from "~/shared/lib/auth-guard";
import { env } from "~/shared/lib/env";
import { normalizeGroupSettingValue } from "~/shared/lib/zulip-group-setting.lib";
import { getCurrentInstance, zulipApi } from "./client";
import {
  getAuthValueForCredentials,
  getValidatedCredentialsRealm,
} from "./zulip-credentials.internal";
import {
  zulipPipelineDelete,
  zulipPipelinePost,
  ensureZulipApiReady,
} from "./zulip-pipeline.internal";
import { parseServerThumbnailFormats } from "./zulip-register-metadata.lib";
import { parseUnreadMessagesCount } from "./zulip-unread.lib";
import {
  buildUserTopicsCacheKey,
  getCachedUserTopicsForKey,
  getCurrentUserTopicsCacheKey,
  parseUserTopics,
  setCachedUserTopicsForKey,
} from "./zulip-user-topics.internal";
import { validateEventCursor, validateQueueId } from "./zulip-validation.internal";
import type {
  GetEventsResult,
  RegisterQueueResult,
  ZulipCredentials,
  ZulipRecentPrivateConversation,
  ZulipRealmUserGroup,
  ZulipSubscription,
  ZulipUserTopic,
} from "./zulip.types";

// Зачем: просим у Zulip только те metadata-секции, которые нужны для sidebar без загрузки больших пачек сообщений.
// `realm` — в т.ч. `server_thumbnail_formats` (размеры превью user_uploads), а `realm_user_groups` нужен для channel-level permission checks.
const DEFAULT_REGISTER_FETCH_EVENT_TYPES = [
  "subscription",
  "user_topic",
  "recent_private_conversations",
  "realm",
  "realm_user_groups",
] as const;

// Что делает: проверяет, что значение является положительным целым id.
function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

// Что делает: безопасно читает recent_private_conversations из register-ответа и отбрасывает битые записи.
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

// Что делает: нормализует список подписок из register-ответа.
// Дополнительно поднимает channel-level поля прав (`can_*_group`) и приватность канала.
function parseSubscriptions(data: unknown): ZulipSubscription[] | null {
  if (!Array.isArray(data)) {
    return null;
  }
  const parsed: ZulipSubscription[] = [];
  for (const row of data) {
    if (typeof row !== "object" || row == null || Array.isArray(row)) {
      continue;
    }
    const subscription = row as {
      stream_id?: unknown;
      name?: unknown;
      is_muted?: unknown;
      in_home_view?: unknown;
      creator_id?: unknown;
      invite_only?: unknown;
      can_add_subscribers_group?: unknown;
      can_remove_subscribers_group?: unknown;
      can_administer_channel_group?: unknown;
    };
    if (!isPositiveInteger(subscription.stream_id) || typeof subscription.name !== "string") {
      continue;
    }
    const canAddSubscribersGroup = normalizeGroupSettingValue(
      subscription.can_add_subscribers_group,
    );
    const canRemoveSubscribersGroup = normalizeGroupSettingValue(
      subscription.can_remove_subscribers_group,
    );
    const canAdministerChannelGroup = normalizeGroupSettingValue(
      subscription.can_administer_channel_group,
    );
    parsed.push({
      stream_id: subscription.stream_id,
      name: subscription.name,
      is_muted:
        typeof subscription.is_muted === "boolean"
          ? subscription.is_muted
          : subscription.in_home_view === false,
      ...(isPositiveInteger(subscription.creator_id)
        ? { creator_id: subscription.creator_id }
        : {}),
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
    });
  }
  return parsed;
}

// Что делает: парсит список realm user groups из register metadata.
// Нужен для вычисления membership в channel-level group-setting значениях.
function parseRealmUserGroups(data: unknown): ZulipRealmUserGroup[] | null {
  if (!Array.isArray(data)) {
    return null;
  }
  const parsed: ZulipRealmUserGroup[] = [];
  for (const row of data) {
    if (row == null || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const record = row as Record<string, unknown>;
    const id = record.id;
    const name = record.name;
    if (!isPositiveInteger(id) || typeof name !== "string") {
      continue;
    }
    const members = Array.isArray(record.members)
      ? Array.from(new Set(record.members.filter(isPositiveInteger))).sort(
          (left, right) => left - right,
        )
      : [];
    const directSubgroupIds = Array.isArray(record.direct_subgroup_ids)
      ? Array.from(new Set(record.direct_subgroup_ids.filter(isPositiveInteger))).sort(
          (left, right) => left - right,
        )
      : [];
    parsed.push({
      id,
      name,
      members,
      direct_subgroup_ids: directSubgroupIds,
      ...(typeof record.is_system_group === "boolean"
        ? { is_system_group: record.is_system_group }
        : {}),
    });
  }
  return parsed;
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
    realm_user_groups?: unknown;
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

  const subscriptions = parseSubscriptions(data.subscriptions);
  const userTopics = parseUserTopics(data.user_topics);
  const recentPrivateConversations = parseRecentPrivateConversations(
    data.recent_private_conversations,
  );
  // Что делает: собирает группы организации для последующей проверки channel permissions в UI/store.
  const realmUserGroups = parseRealmUserGroups(data.realm_user_groups);
  const serverThumbnailFormats = parseServerThumbnailFormats(data.server_thumbnail_formats);
  const cacheKey = getCurrentUserTopicsCacheKey();
  if (cacheKey && userTopics) {
    setCachedUserTopicsForKey(cacheKey, userTopics);
  }

  return {
    queue_id: data.queue_id,
    last_event_id: data.last_event_id,
    event_queue_longpoll_timeout_seconds: data.event_queue_longpoll_timeout_seconds,
    ...(subscriptions ? { subscriptions } : {}),
    ...(userTopics ? { user_topics: userTopics } : {}),
    ...(recentPrivateConversations
      ? { recent_private_conversations: recentPrivateConversations }
      : {}),
    ...(realmUserGroups ? { realm_user_groups: realmUserGroups } : {}),
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
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: authValue,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        event_types: JSON.stringify(eventTypes),
        // Зачем: сохраняем одинаковое поведение register и для фоновых инстансов.
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
    realm_user_groups?: unknown;
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

  const subscriptions = parseSubscriptions(data.subscriptions);
  const userTopics = parseUserTopics(data.user_topics);
  const recentPrivateConversations = parseRecentPrivateConversations(
    data.recent_private_conversations,
  );
  // Что делает: сохраняет группы и для background-loop сценариев.
  const realmUserGroups = parseRealmUserGroups(data.realm_user_groups);
  const serverThumbnailFormats = parseServerThumbnailFormats(data.server_thumbnail_formats);
  setCachedUserTopicsForKey(
    buildUserTopicsCacheKey(credentials.realm, credentials.email),
    userTopics ?? [],
  );

  return {
    queue_id: data.queue_id,
    last_event_id: data.last_event_id,
    event_queue_longpoll_timeout_seconds: data.event_queue_longpoll_timeout_seconds,
    ...(subscriptions ? { subscriptions } : {}),
    ...(userTopics ? { user_topics: userTopics } : {}),
    ...(recentPrivateConversations
      ? { recent_private_conversations: recentPrivateConversations }
      : {}),
    ...(realmUserGroups ? { realm_user_groups: realmUserGroups } : {}),
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
  url.searchParams.set("num_before", "5000");
  url.searchParams.set("num_after", "0");
  url.searchParams.set("narrow", JSON.stringify([{ operator: "is", operand: "unread" }]));
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

/**
 * Legacy accessor user_topic-override из in-memory register cache.
 * Зачем нужен: обратная совместимость старых мест вызова, не использующих bootstrap-пайплайн.
 */
export function fetchUserTopics(): Promise<ZulipUserTopic[]> {
  const cacheKey = getCurrentUserTopicsCacheKey();
  if (!cacheKey) {
    return Promise.resolve([]);
  }
  return Promise.resolve(getCachedUserTopicsForKey(cacheKey));
}
