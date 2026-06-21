/**
 * Create chat API — Workspace endpoints for starting new conversations.
 *
 * Personal chat: resolve or create a private stream via gateway POST /streams/, then navigate to /stream.
 * Channel: POST /channels/create to create and subscribe.
 * Unarchive: PATCH /streams/{stream_uuid} with is_archived=false (delegates to shared unarchiveStream).
 * Also: channel listing and unsubscribe for management flows.
 */

import { messengerApi } from "~/shared/api/client";
import {
  resolveOrCreateDirectMessageStream,
  type DirectMessageStreamRef,
  unarchiveStream,
  type UnarchiveStreamResult,
} from "~/shared/api/messenger-streams";
import type { MessengerGroupSettingValue } from "~/shared/api/messenger.types";
import { guard } from "~/shared/lib/guards";
import { createLogger } from "~/shared/lib/logger";
import {
  compareUserIds,
  isIamUserUuid,
  isUserIdentityReady,
  type UserId,
  userIdStorageKey,
} from "~/shared/lib/user-id.lib";

const log = createLogger("create-chat:api");

export type StartDirectMessageResult = { kind: "gateway" } & DirectMessageStreamRef;

/** Starts a 1:1 personal chat as a gateway private stream. */
export async function startDirectMessage(
  peerUserId: UserId,
  peerFullName: string,
): Promise<StartDirectMessageResult | null> {
  if (!isUserIdentityReady(peerUserId)) {
    return null;
  }
  if (isIamUserUuid(peerUserId)) {
    const stream = await resolveOrCreateDirectMessageStream(peerUserId, peerFullName);
    if (stream == null) {
      return null;
    }
    return { kind: "gateway", ...stream };
  }
  return null;
}

/**
 * Create a new channel (stream) and subscribe the current user + selected subscribers.
 *
 * Messenger API: POST /channels/create
 */
export async function createChannel(params: {
  name: string;
  description?: string;
  subscribers: UserId[];
  inviteOnly?: boolean;
  announce?: boolean;
  canSendMessageGroup?: MessengerGroupSettingValue;
}): Promise<{ streamUuid: string } | null> {
  guard.nonEmpty(params.name, "channel name");
  const subscribers = normalizePrincipalUserIds(params.subscribers);

  try {
    // `/channels/create` payload: name/description at top level (not inside subscriptions[]).
    const body: Record<string, string> = {
      name: params.name.trim(),
      description: params.description ?? "",
    };

    if (params.inviteOnly) {
      // Invite-only private channel.
      body.invite_only = "true";
    }

    if (params.announce != null) {
      // Notification-bot announce only — not posting policy.
      body.announce = String(params.announce);
    }

    if (subscribers.length > 0) {
      // Initial subscriber list at create time.
      body.subscribers = JSON.stringify(subscribers);
    }

    if (params.canSendMessageGroup != null) {
      // Posting policy via can_send_message_group (group id or direct_members/direct_subgroups object).
      body.can_send_message_group =
        typeof params.canSendMessageGroup === "number"
          ? String(params.canSendMessageGroup)
          : JSON.stringify(params.canSendMessageGroup);
    }

    const res = await messengerApi.post("/channels/create", body);

    if (res.ok) {
      log.info("Channel created", { name: params.name });
      const data = res.data as { stream_uuid?: unknown; uuid?: unknown; id?: unknown };
      const streamUuid =
        typeof data.stream_uuid === "string"
          ? data.stream_uuid
          : typeof data.uuid === "string"
            ? data.uuid
            : typeof data.id === "string"
              ? data.id
              : "";
      return streamUuid.length > 0 ? { streamUuid } : null;
    }

    log.warn("Channel creation failed", { status: res.status });
    return null;
  } catch (err) {
    log.error("Channel creation error", { error: String(err) });
    return null;
  }
}

/** Unarchive channel result (thin wrapper over Workspace PATCH). */
export type UnarchiveChannelResult = UnarchiveStreamResult;

/**
 * Unarchive channel: PATCH /streams/{stream_uuid} with is_archived=false.
 */
export async function unarchiveChannel(streamUuid: string): Promise<UnarchiveChannelResult> {
  guard.streamUuid(streamUuid, "unarchiveChannel.streamUuid");
  return unarchiveStream(streamUuid);
}

// ---------------------------------------------------------------------------
// Channel listing
// ---------------------------------------------------------------------------

export interface SubscribedChannel {
  streamUuid: string;
  name: string;
  description: string;
  inviteOnly: boolean;
  subscribers: number[];
}

function normalizePrincipalUserIds(userIds: readonly UserId[]): UserId[] {
  const byKey = new Map<string, UserId>();
  for (const userId of userIds) {
    if (!isUserIdentityReady(userId)) continue;
    byKey.set(userIdStorageKey(userId), userId);
  }
  return Array.from(byKey.values()).sort(compareUserIds);
}

/**
 * Fetch all channels the current user is subscribed to.
 *
 * Messenger API: GET /users/me/subscriptions
 */
export async function fetchSubscribedChannels(): Promise<SubscribedChannel[]> {
  try {
    const res = await messengerApi.get("/users/me/subscriptions");

    if (!res.ok) {
      log.warn("Failed to fetch subscribed channels", { status: res.status });
      return [];
    }

    const data = res.data as {
      subscriptions?: {
        stream_uuid: string;
        name: string;
        description: string;
        invite_only: boolean;
        subscribers?: number[];
      }[];
    };

    const subscriptions = data.subscriptions ?? [];
    return subscriptions.map((s) => ({
      streamUuid: s.stream_uuid,
      name: s.name,
      description: s.description,
      inviteOnly: s.invite_only,
      subscribers: s.subscribers ?? [],
    }));
  } catch (err) {
    log.error("Error fetching subscribed channels", { error: String(err) });
    return [];
  }
}

// ---------------------------------------------------------------------------
// Channel subscription (browse tab)
// ---------------------------------------------------------------------------

export interface SubscribeCurrentUserToStreamResult {
  ok: boolean;
  errorCode?: string;
}

/**
 * Subscribes the current user to an existing channel.
 *
 * Messenger API: POST /users/me/subscriptions (no principals — caller is subscribed).
 */
export async function subscribeCurrentUserToStream(
  streamName: string,
  userId: UserId,
): Promise<SubscribeCurrentUserToStreamResult> {
  const normalizedName = guard
    .nonEmpty(streamName, "subscribeCurrentUserToStream.streamName")
    .trim();
  if (!isUserIdentityReady(userId)) {
    return { ok: false, errorCode: "invalid_user" };
  }

  try {
    const res = await messengerApi.post("/users/me/subscriptions", {
      subscriptions: JSON.stringify([{ name: normalizedName }]),
    });

    if (!res.ok) {
      log.warn("Subscribe to channel failed", { status: res.status });
      return { ok: false, errorCode: `http_${res.status}` };
    }

    const payload = res.data as { result?: string; code?: string };
    if (payload.result === "error") {
      log.warn("Subscribe to channel rejected", { code: payload.code });
      return { ok: false, errorCode: payload.code ?? "unknown_error" };
    }

    log.info("Subscribed to channel", { streamNameLength: normalizedName.length });
    return { ok: true };
  } catch (err) {
    log.error("Subscribe to channel error", { error: String(err) });
    return { ok: false, errorCode: "network_error" };
  }
}

// ---------------------------------------------------------------------------
// Channel unsubscription
// ---------------------------------------------------------------------------

/**
 * Unsubscribe the current user from a channel.
 *
 * Messenger API: DELETE /users/me/subscriptions with subscriptions body.
 */
export async function unsubscribeChannel(streamName: string): Promise<boolean> {
  guard.nonEmpty(streamName, "stream name");

  try {
    const res = await messengerApi.delete("/users/me/subscriptions", {
      subscriptions: JSON.stringify([streamName]),
    });

    if (res.ok) {
      log.info("Unsubscribed from channel", { streamName });
      return true;
    }

    log.warn("Channel unsubscribe failed", { streamName, status: res.status });
    return false;
  } catch (err) {
    log.error("Channel unsubscribe error", { streamName, error: String(err) });
    return false;
  }
}
