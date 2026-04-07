/**
 * Create chat API — Zulip endpoints for starting new conversations.
 *
 * DM: just navigate to /dm/<userId> — no explicit "create" API needed.
 * Group: same — navigate to /dm/<id1>,<id2>,... with first message.
 * Channel: POST /users/me/subscriptions to create and subscribe.
 *
 * Also provides channel listing and unsubscription for management flows.
 */

import { zulipApi } from "~/shared/api/client";
import { guard } from "~/shared/lib/guards";
import { createLogger } from "~/shared/lib/logger";

const log = createLogger("create-chat:api");

/**
 * Create a new channel (stream) and subscribe the current user + selected subscribers.
 *
 * Zulip API: POST /users/me/subscriptions
 */
export async function createChannel(params: {
  name: string;
  description?: string;
  subscribers: number[];
  inviteOnly?: boolean;
  announce?: boolean;
}): Promise<{ streamId: number } | null> {
  guard.nonEmpty(params.name, "channel name");
  for (const uid of params.subscribers) {
    guard.userId(uid, "createChannel subscribers");
  }

  try {
    const subscriptions = [
      {
        name: params.name,
        description: params.description ?? "",
      },
    ];

    const body: Record<string, string> = {
      subscriptions: JSON.stringify(subscriptions),
    };

    if (params.inviteOnly) {
      body.invite_only = "true";
    }

    if (params.announce != null) {
      body.announce = String(params.announce);
    }

    if (params.subscribers.length > 0) {
      body.principals = JSON.stringify(params.subscribers);
    }

    const res = await zulipApi.post("/users/me/subscriptions", body);

    if (res.ok) {
      log.info("Channel created", { name: params.name });
      const data = res.data as {
        subscribed?: Record<string, string[] | { name: string; id: number }[]>;
      };
      const subscribed = data.subscribed ?? {};
      const firstEntry = Object.values(subscribed)[0];
      if (Array.isArray(firstEntry) && firstEntry.length > 0) {
        const first = firstEntry[0];
        const streamId = typeof first === "object" && first != null && "id" in first ? first.id : 0;
        return { streamId };
      }
      return { streamId: 0 };
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
