import type { MockMessage } from "~/shared/api/zulip.types";
import { buildDmRouteSlugFromRecipients } from "~/shared/lib/dm-route-slug.lib";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { encodeTopicForRoute, normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import type { PushClickTargetInput, PushNotificationClickPayload } from "./push-click.types";

export type { PushClickTargetInput, PushNotificationClickPayload };

function normalizeRealmForComparison(realm: string): string {
  return realm
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api\/v1$/, "")
    .replace(/\/api$/, "")
    .toLowerCase();
}

function slugifyStreamName(streamName: string): string {
  return streamName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+$/, "")
    .replace(/^-+/, "");
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

function normalizeNonEmpty(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function parseNearMessageIdFromZulipHash(hash: string): number | undefined {
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
    return parsePositiveInt(decodeURIComponent(rawNear));
  } catch {
    return parsePositiveInt(rawNear);
  }
}

export function buildPushClickUrl(input: PushClickTargetInput): string {
  const withMessageId = (base: string): string =>
    input.messageId != null ? `${base}?msg=${input.messageId}` : base;
  const streamName = normalizeNonEmpty(input.streamName);
  const hasTopic = input.topic != null;
  const topic = hasTopic ? normalizeTopicForIdentity(input.topic ?? "") : undefined;

  if (input.type === "stream" && streamName) {
    const base =
      input.streamId != null
        ? withCurrentOrgRoute(
            `/stream/${input.streamId}-${slugifyStreamName(streamName) || "channel"}`,
          )
        : withCurrentOrgRoute(`/stream/${encodeURIComponent(streamName)}`);
    return hasTopic
      ? withMessageId(`${base}/topic/${encodeURIComponent(encodeTopicForRoute(topic ?? ""))}`)
      : withMessageId(base);
  }

  if (input.type === "private" && input.senderId != null) {
    return withMessageId(withCurrentOrgRoute(`/dm/${input.senderId}`));
  }

  return withCurrentOrgRoute("/");
}

export function buildMessageRedirectRoute(messageId: number, realmUri?: string): string {
  const base = withCurrentOrgRoute(`/message/${messageId}`);
  return realmUri ? `${base}?realm=${encodeURIComponent(realmUri)}` : base;
}

export function buildMessageRedirectRouteFromZulipPermalink(permalink: string): string | null {
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

  const nearMessageId = parseNearMessageIdFromZulipHash(parsedUrl.hash);
  if (nearMessageId == null) {
    return null;
  }

  const isAbsoluteHttpPermalink = /^https?:\/\//i.test(normalizedPermalink);
  const realmUri = isAbsoluteHttpPermalink ? parsedUrl.origin : undefined;
  return buildMessageRedirectRoute(nearMessageId, realmUri);
}

export function buildRouteFromPushNotificationClick(payload: PushNotificationClickPayload): string {
  const messageId = parsePositiveInt(payload.messageId);
  if (messageId != null) {
    return buildMessageRedirectRoute(messageId, payload.realmUri);
  }

  const messageType =
    payload.messageType === "stream" || payload.messageType === "private"
      ? payload.messageType
      : undefined;

  return buildPushClickUrl({
    type: messageType,
    streamId: parsePositiveInt(payload.streamId),
    streamName: typeof payload.streamName === "string" ? payload.streamName : undefined,
    topic: typeof payload.topic === "string" ? payload.topic : undefined,
    senderId: parsePositiveInt(payload.senderId),
  });
}

export function buildRouteFromMessage(
  message: Pick<MockMessage, "id" | "stream_id" | "channel" | "display_recipient" | "subject">,
  currentUserId: number | null,
): string | null {
  if (message.stream_id != null) {
    const streamName =
      message.channel ??
      (typeof message.display_recipient === "string" ? message.display_recipient : "general");
    const topic = (message.subject ?? "").trim();
    return buildPushClickUrl({
      type: "stream",
      streamId: message.stream_id,
      streamName,
      topic,
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
    id: number;
    stream_id?: number | null;
    channel?: string;
    display_recipient?: MockMessage["display_recipient"];
    subject?: string;
    sender_id?: number;
  },
  currentUserId: number | null,
): string | null {
  const exactRoute = buildRouteFromMessage(
    {
      id: message.id,
      stream_id: message.stream_id ?? null,
      channel: message.channel,
      display_recipient: message.display_recipient,
      subject: message.subject ?? "",
    },
    currentUserId,
  );
  if (exactRoute) {
    return exactRoute;
  }

  if (message.sender_id != null) {
    if (currentUserId != null && message.sender_id === currentUserId) {
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
