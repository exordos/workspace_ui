/**
 * Create chat API — Zulip endpoints for starting new conversations.
 *
 * DM: just navigate to /dm/<userId> — no explicit "create" API needed.
 * Group: same — navigate to /dm/<id1>,<id2>,... with first message.
 * Channel: POST /channels/create to create and subscribe.
 *
 * Also provides channel listing and unsubscription for management flows.
 */

import { zulipApi } from "~/shared/api/client";
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
    // Что делает: формирует payload строго под новый Zulip endpoint `/channels/create`.
    // В отличие от старого `/users/me/subscriptions` тут передаются `name` и `description`
    // на верхнем уровне, а не внутри массива `subscriptions`.
    const body: Record<string, string> = {
      name: params.name.trim(),
      description: params.description ?? "",
    };

    if (params.inviteOnly) {
      // Что делает: включает private channel режим (invite-only).
      body.invite_only = "true";
    }

    if (params.announce != null) {
      // Что делает: управляет только уведомлением от notification bot о создании канала.
      // Это НЕ настройка прав публикации.
      body.announce = String(params.announce);
    }

    if (params.subscribers.length > 0) {
      // Что делает: передает initial список пользователей, которых подписываем при создании.
      body.subscribers = JSON.stringify(params.subscribers);
    }

    if (params.canSendMessageGroup != null) {
      // Что делает: задает политику "кто может писать" через `can_send_message_group`.
      // Zulip принимает либо id группы (integer), либо объект `{ direct_members, direct_subgroups }`.
      body.can_send_message_group =
        typeof params.canSendMessageGroup === "number"
          ? String(params.canSendMessageGroup)
          : JSON.stringify(params.canSendMessageGroup);
    }

    const res = await zulipApi.post("/channels/create", body);

    if (res.ok) {
      log.info("Channel created", { name: params.name });
      // Что делает: для `/channels/create` stream id приходит в поле `id`.
      // Если сервер не вернул id, оставляем безопасный fallback `0`.
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
