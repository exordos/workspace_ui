/**
 * Zulip real-time event queue: register, poll, delete; unread count for credentials.
 */
import { t } from "~/i18n/i18n";
import { getBasicAuthValue } from "~/shared/lib/auth-guard";
import { getCurrentInstance, zulipApi } from "./client";
import { env } from "~/shared/lib/env";
import { parseUnreadMessagesCount } from "./zulip-unread.lib";
import {
  getAuthValueForCredentials,
  getValidatedCredentialsRealm,
} from "./zulip-credentials.internal";
import {
  zulipPipelineDelete,
  zulipPipelinePost,
  ensureZulipApiReady,
} from "./zulip-pipeline.internal";
import {
  buildUserTopicsCacheKey,
  getCachedUserTopicsForKey,
  getCurrentUserTopicsCacheKey,
  parseUserTopics,
  setCachedUserTopicsForKey,
} from "./zulip-user-topics.internal";
import type {
  GetEventsResult,
  RegisterQueueResult,
  ZulipCredentials,
  ZulipUserTopic,
} from "./zulip.types";
import { validateEventCursor, validateQueueId } from "./zulip-validation.internal";

/** Registers an event queue (POST /api/v1/register). Returns queue_id for subsequent long-polling. */
export async function registerQueue(eventTypes: string[]): Promise<RegisterQueueResult> {
  const body: Record<string, string> = {
    event_types: JSON.stringify(eventTypes),
  };
  const res = await zulipPipelinePost("register", body);
  const data = res.data as {
    result?: string;
    msg?: string;
    code?: string;
    queue_id?: string;
    last_event_id?: number;
    event_queue_longpoll_timeout_seconds?: number;
    user_topics?: unknown;
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
  const cacheKey = getCurrentUserTopicsCacheKey();
  if (cacheKey && userTopics) {
    setCachedUserTopicsForKey(cacheKey, userTopics);
  }

  return {
    queue_id: data.queue_id,
    last_event_id: data.last_event_id,
    event_queue_longpoll_timeout_seconds: data.event_queue_longpoll_timeout_seconds,
    ...(userTopics ? { user_topics: userTopics } : {}),
  };
}

/** Registers queue with explicit credentials (used for background multi-org loops). */
export async function registerQueueForCredentials(
  credentials: ZulipCredentials,
  eventTypes: string[],
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
  setCachedUserTopicsForKey(
    buildUserTopicsCacheKey(credentials.realm, credentials.email),
    userTopics ?? [],
  );

  return {
    queue_id: data.queue_id,
    last_event_id: data.last_event_id,
    event_queue_longpoll_timeout_seconds: data.event_queue_longpoll_timeout_seconds,
    ...(userTopics ? { user_topics: userTopics } : {}),
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
 * Reads total unread count for any instance credentials (GET /api/v1/users/me/unread_messages).
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
  const url = `${base}${env.ZULIP_API_PATH}/users/me/unread_messages`;
  const authValue = getBasicAuthValue({
    email: credentials.email,
    apiKey: credentials.apiKey,
  });
  if (authValue == null) return null;

  let response: Response;
  try {
    response = await fetch(url, {
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

/** Returns user topic visibility overrides from the register-queue snapshot cache. */
export function fetchUserTopics(): Promise<ZulipUserTopic[]> {
  const cacheKey = getCurrentUserTopicsCacheKey();
  if (!cacheKey) {
    return Promise.resolve([]);
  }
  return Promise.resolve(getCachedUserTopicsForKey(cacheKey));
}
