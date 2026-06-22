/**
 * Workspace realtime event queue: register, long-poll, delete, and unread counts for credentials.
 */
import { t } from "~/i18n/i18n";
import { getBasicAuthValue } from "~/shared/lib/auth-guard";
import { env } from "~/shared/lib/env";
import { isBadEventQueueIdResponse } from "~/shared/lib/messenger-event-queue-errors.lib";
import { getCurrentInstance, messengerApi } from "./client";
import {
  getAuthValueForCredentials,
  getValidatedCredentialsRealm,
} from "./messenger-credentials.internal";
import { createLongPollAbortSetup } from "./messenger-events-longpoll.lib";
import {
  messengerPipelineDelete,
  messengerPipelinePost,
  ensureMessengerApiReady,
} from "./messenger-pipeline.internal";
import {
  buildRegisterQueueResult,
  parseRegisterQueueMetadata,
  toOwnAvatarCapabilities,
} from "./messenger-register-queue-result.lib";
import {
  buildUserTopicsCacheKey,
  getCurrentUserTopicsCacheKey,
  setCachedUserTopicsForKey,
} from "./messenger-user-topics.internal";
import { validateEventCursor, validateQueueId } from "./messenger-validation.internal";
import type {
  GetEventsResult,
  RegisterQueueResult,
  MessengerCredentials,
  WorkspaceOwnAvatarCapabilities,
} from "./messenger.types";

export { parseSubscriptions } from "./messenger-queue-parse-subscription.lib";

/** Register metadata for sidebar bootstrap without loading large message batches. */
export const DEFAULT_REGISTER_FETCH_EVENT_TYPES = [
  "subscription",
  "user_topic",
  "recent_private_conversations",
  "realm",
  "realm_user_groups",
  "user_settings",
  "user_status",
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

let cachedOwnAvatarCapabilities: WorkspaceOwnAvatarCapabilities = {};

function setCachedOwnAvatarCapabilities(capabilities: WorkspaceOwnAvatarCapabilities): void {
  cachedOwnAvatarCapabilities = capabilities;
}

export function getCachedOwnAvatarCapabilities(): WorkspaceOwnAvatarCapabilities {
  return cachedOwnAvatarCapabilities;
}

/** Registers an event queue and returns `queue_id` for long-polling. */
export async function registerQueue(
  eventTypes: string[],
  fetchEventTypes: string[] = [...DEFAULT_REGISTER_FETCH_EVENT_TYPES],
): Promise<RegisterQueueResult> {
  const body: Record<string, string> = {
    event_types: JSON.stringify(eventTypes),
    apply_markdown: "false",
    client_capabilities: JSON.stringify(REGISTER_CLIENT_CAPABILITIES),
  };
  if (fetchEventTypes.length > 0) {
    body.fetch_event_types = JSON.stringify(fetchEventTypes);
  }
  const res = await messengerPipelinePost("register", body);
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
    realm_can_move_messages_between_channels_group?: unknown;
    realm_allow_message_editing?: unknown;
    realm_message_content_edit_limit_seconds?: unknown;
    realm_user_groups?: unknown;
    server_thumbnail_formats?: unknown;
    max_avatar_file_size_mib?: unknown;
    realm_avatar_changes_disabled?: unknown;
    server_avatar_changes_disabled?: unknown;
    user_settings?: unknown;
    user_status?: unknown;
    starred_messages?: unknown;
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

/** Registers a queue with explicit credentials (background multi-org loops). */
export async function registerQueueForCredentials(
  credentials: MessengerCredentials,
  eventTypes: string[],
  fetchEventTypes: string[] = [...DEFAULT_REGISTER_FETCH_EVENT_TYPES],
): Promise<RegisterQueueResult> {
  const base = getValidatedCredentialsRealm(credentials, "registerQueueForCredentials");
  const authValue = getAuthValueForCredentials(credentials);
  const url = `${base}${env.MESSENGER_API_V1_PATH}/register`;

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
        // Background instances do not render message HTML in the UI.
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
    realm_can_move_messages_between_channels_group?: unknown;
    realm_allow_message_editing?: unknown;
    realm_message_content_edit_limit_seconds?: unknown;
    realm_user_groups?: unknown;
    server_thumbnail_formats?: unknown;
    max_avatar_file_size_mib?: unknown;
    realm_avatar_changes_disabled?: unknown;
    server_avatar_changes_disabled?: unknown;
    user_settings?: unknown;
    user_status?: unknown;
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
    buildUserTopicsCacheKey(credentials.realm, credentials.login),
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

/**
 * Best-effort queue cleanup on logout or instance switch.
 * Pass credentials explicitly during switch — `getCurrentInstance()` may already point elsewhere.
 */
export async function deleteQueue(
  queueId: string,
  credentials?: MessengerCredentials,
): Promise<void> {
  try {
    const safeQueueId = queueId.trim();
    if (safeQueueId.length === 0) return;

    if (credentials == null) {
      const inst = getCurrentInstance();
      if (!inst) return;
      await messengerPipelineDelete("events", { queue_id: safeQueueId });
      return;
    }

    const base = getValidatedCredentialsRealm(credentials, "deleteQueue");
    const url = `${base}${env.MESSENGER_API_V1_PATH}/events`;
    const authValue = getBasicAuthValue({ login: credentials.login, apiKey: credentials.apiKey });
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

/** Long-polls for events; supports timeout and `AbortSignal`. */
export async function getEvents(
  queueId: string,
  lastEventId: number,
  options?: { timeoutSec?: number; signal?: AbortSignal },
): Promise<GetEventsResult> {
  const safeQueueId = validateQueueId(queueId, "getEvents");
  const safeLastEventId = validateEventCursor(lastEventId, "getEvents");
  ensureMessengerApiReady();

  const { signal, cleanup } = createLongPollAbortSetup(options);

  try {
    const res = await messengerApi.get(
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

/** Long-polls with explicit credentials (background multi-org loops). */
export async function getEventsForCredentials(
  credentials: MessengerCredentials,
  queueId: string,
  lastEventId: number,
  options?: { timeoutSec?: number; signal?: AbortSignal },
): Promise<GetEventsResult> {
  const safeQueueId = validateQueueId(queueId, "getEventsForCredentials");
  const safeLastEventId = validateEventCursor(lastEventId, "getEventsForCredentials");
  const base = getValidatedCredentialsRealm(credentials, "getEventsForCredentials");
  const authValue = getAuthValueForCredentials(credentials);
  const url = new URL(`${base}${env.MESSENGER_API_V1_PATH}/events`);
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
