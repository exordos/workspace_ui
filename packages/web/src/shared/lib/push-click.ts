import type { MockMessage } from "~/shared/api/messenger.types";
import { buildDmRouteSlugFromRecipients } from "~/shared/lib/dm-route-slug.lib";
import { normalizeMessageId } from "~/shared/lib/message-id.lib";
import type { MessageId } from "~/shared/lib/message-id.lib";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { encodeTopicForRoute } from "~/shared/lib/topic-identity.lib";
import type { UserId } from "~/shared/lib/user-id.lib";
import type { PushClickTargetInput, PushNotificationClickPayload } from "./push-click.types";

export type { PushClickTargetInput, PushNotificationClickPayload };

function normalizeRealmForComparison(realm: string): string {
  return realm
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api\/workspace\/v1\/messenger$/i, "")
    .toLowerCase();
}

function parsePositiveInt(value: number | string | undefined): number | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) {
      return undefined;
    }
    const parsed = Number(trimmed);
    if (Number.isSafeInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
}

function parseMessageId(value: MessageId | undefined): MessageId | undefined {
  return normalizeMessageId(value) ?? undefined;
}

function normalizeNonEmpty(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function parseStreamUuid(value: string | undefined): string | undefined {
  const normalized = normalizeNonEmpty(value);
  const lower = normalized?.toLowerCase();
  if (lower == null) return undefined;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(lower)
    ? lower
    : undefined;
}

function parseNearMessageIdFromWorkspaceHash(hash: string): MessageId | undefined {
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!normalizedHash.startsWith("narrow/")) {
    return undefined;
  }
  const nearMatch = /(?:^|\/)near\/([^/?#]+)/i.exec(normalizedHash);
  if (nearMatch == null) {
    return undefined;
  }
  const rawNear = nearMatch[1];
  if (rawNear == null || rawNear.length === 0) {
    return undefined;
  }
  try {
    return parseMessageId(decodeURIComponent(rawNear));
  } catch {
    return parseMessageId(rawNear);
  }
}

export function buildPushClickUrl(input: PushClickTargetInput): string {
  const withMessageId = (base: string): string =>
    input.messageId != null ? `${base}?msg=${input.messageId}` : base;
  const topic = normalizeNonEmpty(input.topic);
  const hasTopic = topic != null;

  if (input.type === "stream") {
    const streamUuid = parseStreamUuid(input.streamId);
    if (streamUuid == null) {
      return withCurrentOrgRoute("/");
    }
    const base = withCurrentOrgRoute(`/stream/${encodeURIComponent(streamUuid.toLowerCase())}`);
    return hasTopic
      ? withMessageId(`${base}/topic/${encodeURIComponent(encodeTopicForRoute(topic ?? ""))}`)
      : withMessageId(base);
  }

  if (input.type === "private" && input.senderId != null) {
    return withMessageId(withCurrentOrgRoute(`/dm/${input.senderId}`));
  }

  return withCurrentOrgRoute("/");
}

export function buildMessageRedirectRoute(messageId: MessageId, realmUri?: string): string {
  const base = withCurrentOrgRoute(`/message/${messageId}`);
  return realmUri ? `${base}?realm=${encodeURIComponent(realmUri)}` : base;
}

export function buildMessageRedirectRouteFromWorkspacePermalink(permalink: string): string | null {
  const normalizedPermalink = permalink.trim();
  if (normalizedPermalink.length === 0) {
    return null;
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(normalizedPermalink, "https://workspace.local");
  } catch {
    return null;
  }

  const nearMessageId = parseNearMessageIdFromWorkspaceHash(parsedUrl.hash);
  if (nearMessageId == null) {
    return null;
  }

  const isAbsoluteHttpPermalink = /^https?:\/\//i.test(normalizedPermalink);
  const realmUri = isAbsoluteHttpPermalink ? parsedUrl.origin : undefined;
  return buildMessageRedirectRoute(nearMessageId, realmUri);
}

export function buildRouteFromPushNotificationClick(payload: PushNotificationClickPayload): string {
  const messageId = parseMessageId(payload.messageId);
  if (messageId != null) {
    return buildMessageRedirectRoute(messageId, payload.realmUri);
  }

  const messageType =
    payload.messageType === "stream" || payload.messageType === "private"
      ? payload.messageType
      : undefined;

  return buildPushClickUrl({
    type: messageType,
    streamId: parseStreamUuid(payload.streamId),
    streamName: typeof payload.streamName === "string" ? payload.streamName : undefined,
    topic: typeof payload.topic === "string" ? payload.topic : undefined,
    senderId: parsePositiveInt(payload.senderId),
  });
}

export function buildRouteFromMessage(
  message: {
    id: MessageId;
    stream_uuid?: string | null;
    channel?: string;
    display_recipient?: MockMessage["display_recipient"];
    subject?: string;
    topic_uuid?: string;
  },
  currentUserId: UserId | null,
): string | null {
  if (message.stream_uuid != null) {
    const streamName =
      message.channel ??
      (typeof message.display_recipient === "string" ? message.display_recipient : "general");
    const topic = normalizeNonEmpty(message.topic_uuid) ?? normalizeNonEmpty(message.subject);
    return buildPushClickUrl({
      type: "stream",
      streamId: message.stream_uuid,
      streamName,
      ...(topic != null ? { topic } : {}),
      messageId: message.id,
    });
  }

  if (Array.isArray(message.display_recipient)) {
    const dmSlug = buildDmRouteSlugFromRecipients(message.display_recipient, currentUserId);
    if (dmSlug != null) {
      const base = withCurrentOrgRoute(`/dm/${dmSlug}`);
      return `${base}?msg=${message.id}`;
    }
  }

  return null;
}

export function buildNavigableRouteFromMessage(
  message: {
    id: MessageId;
    stream_uuid?: string | null;
    channel?: string;
    display_recipient?: MockMessage["display_recipient"];
    subject?: string;
    topic_uuid?: string;
    sender_id?: number;
  },
  currentUserId: UserId | null,
): string | null {
  const exactRoute = buildRouteFromMessage(
    {
      id: message.id,
      stream_uuid: message.stream_uuid ?? null,
      channel: message.channel,
      display_recipient: message.display_recipient,
      ...(message.subject != null ? { subject: message.subject } : {}),
      ...(message.topic_uuid != null ? { topic_uuid: message.topic_uuid } : {}),
    },
    currentUserId,
  );
  if (exactRoute) {
    return exactRoute;
  }

  if (message.sender_id != null) {
    if (typeof currentUserId === "number" && message.sender_id === currentUserId) {
      return null;
    }
    return `${withCurrentOrgRoute(`/dm/${message.sender_id}`)}?msg=${message.id}`;
  }

  return null;
}

export function findInstanceIdByRealmUri(
  instances: { id: string; realm: string }[],
  realmUri?: string,
): string | null {
  if (!realmUri) return null;
  const target = normalizeRealmForComparison(realmUri);
  const match = instances.find(
    (instance) => normalizeRealmForComparison(instance.realm) === target,
  );
  return match?.id ?? null;
}
