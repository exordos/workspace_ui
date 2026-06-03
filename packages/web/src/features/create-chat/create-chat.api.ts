/**
 * Create chat API — Zulip endpoints for starting new conversations.
 *
 * DM: just navigate to /dm/<userId> — no explicit "create" API needed.
 * Group: same — navigate to /dm/<id1>,<id2>,... with first message.
 * Channel: POST /channels/create to create and subscribe.
 * Unarchive: PATCH /streams/{stream_id} with is_archived=false (delegates to shared unarchiveStream).
 * Also: channel listing and unsubscribe for management flows.
 */

import { zulipApi } from "~/shared/api/client";
import { unarchiveStream } from "~/shared/api/zulip-streams";
import type { UnarchiveStreamResult } from "~/shared/api/zulip-streams";
import type { ZulipGroupSettingValue } from "~/shared/api/zulip.types";
import { guard } from "~/shared/lib/guards";
import { createLogger } from "~/shared/lib/logger";

const log = createLogger("create-chat:api");

/**
 * Create a new channel (stream) and subscribe the current user + selected subscribers.
 *
 * Zulip API: POST /channels/create
 */
export async function createChannel(params: {
  name: string;
  description?: string;
  subscribers: number[];
  inviteOnly?: boolean;
  announce?: boolean;
  canSendMessageGroup?: ZulipGroupSettingValue;
}): Promise<{ streamId: number } | null> {
  guard.nonEmpty(params.name, "channel name");
  for (const uid of params.subscribers) {
    guard.userId(uid, "createChannel subscribers");
  }

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

    if (params.subscribers.length > 0) {
      // Initial subscriber list at create time.
      body.subscribers = JSON.stringify(params.subscribers);
    }

    if (params.canSendMessageGroup != null) {
      // Posting policy via can_send_message_group (group id or direct_members/direct_subgroups object).
      body.can_send_message_group =
        typeof params.canSendMessageGroup === "number"
          ? String(params.canSendMessageGroup)
          : JSON.stringify(params.canSendMessageGroup);
    }

    const res = await zulipApi.post("/channels/create", body);

    if (res.ok) {
      log.info("Channel created", { name: params.name });
      // `/channels/create` returns stream id in `id`; fallback 0 if missing.
      const data = res.data as { id?: unknown };
      const streamId = typeof data.id === "number" && Number.isInteger(data.id) ? data.id : 0;
      return { streamId };
    }

    log.warn("Channel creation failed", { status: res.status });
    return null;
  } catch (err) {
    log.error("Channel creation error", { error: String(err) });
    return null;
  }
}

/** Unarchive channel result (thin wrapper over Zulip PATCH). */
export type UnarchiveChannelResult = UnarchiveStreamResult;

/**
 * Unarchive channel: PATCH /streams/{stream_id} with is_archived=false.
 * Compatibility errors (ignored_parameters_unsupported) are classified inside unarchiveStream.
 */
export async function unarchiveChannel(streamId: number): Promise<UnarchiveChannelResult> {
  guard.streamId(streamId, "unarchiveChannel.streamId");
  return unarchiveStream(streamId);
}

// ---------------------------------------------------------------------------
// Channel listing
// ---------------------------------------------------------------------------

export interface SubscribedChannel {
  streamId: number;
  name: string;
  description: string;
  inviteOnly: boolean;
  subscribers: number[];
}

/**
 * Fetch all channels the current user is subscribed to.
 *
 * Zulip API: GET /users/me/subscriptions
 */
export async function fetchSubscribedChannels(): Promise<SubscribedChannel[]> {
  try {
    const res = await zulipApi.get("/users/me/subscriptions");

    if (!res.ok) {
      log.warn("Failed to fetch subscribed channels", { status: res.status });
      return [];
    }

    const data = res.data as {
      subscriptions?: {
        stream_id: number;
        name: string;
        description: string;
        invite_only: boolean;
        subscribers?: number[];
      }[];
    };

    const subscriptions = data.subscriptions ?? [];
    return subscriptions.map((s) => ({
      streamId: s.stream_id,
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
// Channel unsubscription
// ---------------------------------------------------------------------------

/**
 * Unsubscribe the current user from a channel.
 *
 * Zulip API: DELETE /users/me/subscriptions with subscriptions body.
 */
export async function unsubscribeChannel(streamName: string): Promise<boolean> {
  guard.nonEmpty(streamName, "stream name");

  try {
    const res = await zulipApi.delete("/users/me/subscriptions", {
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
