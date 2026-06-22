/**
 * Create chat API — Workspace endpoints for starting new conversations.
 *
 * Personal chat: resolve or create a private stream via gateway POST /streams/, then navigate to /stream.
 * Channel creation is not exposed by the current Workspace gateway backend.
 * Unarchive: PATCH /streams/{stream_uuid} with is_archived=false (delegates to shared unarchiveStream).
 * Also: channel listing and unsubscribe for management flows.
 */

import {
  fetchSubscriptions,
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
 * Create a new channel (stream) when supported by the backend.
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

  log.warn("Channel creation is unsupported by the current backend", {
    nameLength: params.name.trim().length,
    subscriberCount: subscribers.length,
  });
  return null;
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
 * Fetch all channels the current user is subscribed to through the new streams facade.
 */
export async function fetchSubscribedChannels(): Promise<SubscribedChannel[]> {
  const subscriptions = await fetchSubscriptions();
  return subscriptions.map((s) => ({
    streamUuid: s.stream_uuid,
    name: s.name,
    description: s.description,
    inviteOnly: s.invite_only,
    subscribers: [],
  }));
}

// ---------------------------------------------------------------------------
// Channel subscription (browse tab)
// ---------------------------------------------------------------------------

export interface SubscribeCurrentUserToStreamResult {
  ok: boolean;
  errorCode?: string;
}

/**
 * Subscribes the current user to an existing channel when supported by the backend.
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

  log.warn("Channel subscription is unsupported by the current backend", {
    streamNameLength: normalizedName.length,
  });
  return { ok: false, errorCode: "unsupported" };
}

// ---------------------------------------------------------------------------
// Channel unsubscription
// ---------------------------------------------------------------------------

/**
 * Unsubscribe the current user from a channel when supported by the backend.
 */
export async function unsubscribeChannel(streamName: string): Promise<boolean> {
  const normalizedName = guard.nonEmpty(streamName, "stream name").trim();
  log.warn("Channel unsubscribe is unsupported by the current backend", {
    streamNameLength: normalizedName.length,
  });
  return false;
}
