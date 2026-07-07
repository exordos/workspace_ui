/**
 * Zulip realtime event queue: register, long-poll, and delete for the active instance.
 */
import { t } from "~/i18n/i18n";
import {
  configureZulipEmojiCatalog,
  ensureZulipEmojiCatalogLoaded,
} from "~/shared/lib/zulip-emoji-catalog.lib";
import { isBadEventQueueIdResponse } from "~/shared/lib/zulip-event-queue-errors.lib";
import { getCurrentInstance, zulipApi } from "./client";
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
import {
  getCachedUserTopicsForKey,
  getCurrentUserTopicsCacheKey,
  setCachedUserTopicsForKey,
} from "./zulip-user-topics.internal";
import { validateEventCursor, validateQueueId } from "./zulip-validation.internal";
import type {
  GetEventsResult,
  RegisterQueueResult,
  ZulipOwnAvatarCapabilities,
  ZulipUserTopic,
} from "./zulip.types";

export { parseSubscriptions } from "./zulip-queue-parse-subscription.lib";

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

let cachedOwnAvatarCapabilities: ZulipOwnAvatarCapabilities = {};

function setCachedOwnAvatarCapabilities(capabilities: ZulipOwnAvatarCapabilities): void {
  cachedOwnAvatarCapabilities = capabilities;
}

export function getCachedOwnAvatarCapabilities(): ZulipOwnAvatarCapabilities {
  return cachedOwnAvatarCapabilities;
}

export interface RegisterQueueOptions {
  signal?: AbortSignal;
  shouldApplyActiveMetadata?: () => boolean;
}

/** Registers an event queue and returns `queue_id` for long-polling. */
export async function registerQueue(
  eventTypes: string[],
  fetchEventTypes: string[] = [...DEFAULT_REGISTER_FETCH_EVENT_TYPES],
  options?: RegisterQueueOptions,
): Promise<RegisterQueueResult> {
  const body: Record<string, string> = {
    event_types: JSON.stringify(eventTypes),
    apply_markdown: "false",
    client_capabilities: JSON.stringify(REGISTER_CLIENT_CAPABILITIES),
  };
  if (fetchEventTypes.length > 0) {
    body.fetch_event_types = JSON.stringify(fetchEventTypes);
  }
  const res = await zulipPipelinePost("register", body, options?.signal);
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
    unread_msgs?: unknown;
    starred_messages?: unknown;
    server_emoji_data_url?: unknown;
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
  const shouldApplyActiveMetadata =
    options?.signal?.aborted !== true && (options?.shouldApplyActiveMetadata?.() ?? true);
  if (shouldApplyActiveMetadata) {
    setCachedOwnAvatarCapabilities(toOwnAvatarCapabilities(metadata));
    configureZulipEmojiCatalog(metadata.serverEmojiDataUrl, getCurrentInstance()?.realm);
    void ensureZulipEmojiCatalogLoaded();
    const cacheKey = getCurrentUserTopicsCacheKey();
    if (cacheKey && metadata.userTopics) {
      setCachedUserTopicsForKey(cacheKey, metadata.userTopics);
    }
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

/** Best-effort queue cleanup on logout or instance switch. */
export async function deleteQueue(queueId: string): Promise<void> {
  try {
    const safeQueueId = queueId.trim();
    if (safeQueueId.length === 0) return;

    const inst = getCurrentInstance();
    if (!inst) return;
    await zulipPipelineDelete("events", { queue_id: safeQueueId });
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

/** Legacy in-memory register cache accessor for callers not yet on the bootstrap pipeline. */
export function fetchUserTopics(): Promise<ZulipUserTopic[]> {
  const cacheKey = getCurrentUserTopicsCacheKey();
  if (!cacheKey) {
    return Promise.resolve([]);
  }
  return Promise.resolve(getCachedUserTopicsForKey(cacheKey));
}
