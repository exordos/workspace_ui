import { withCurrentOrgRoute, withOrgRoutePrefix } from "~/shared/lib/org-route";
import { buildStreamSlug } from "~/shared/lib/stream-slug.lib";
import { encodeTopicForRoute } from "~/shared/lib/topic-identity.lib";
import {
  workspaceMessengerMessageRoute,
  workspaceMessengerStreamRoute,
  workspaceMessengerTopicRoute,
} from "~/shared/lib/workspace-messenger-route.lib";
import type { PushClickTargetInput, PushNotificationClickPayload } from "./push-click.types";

export type { PushClickTargetInput, PushNotificationClickPayload };

type WorkspacePushRouteFields = Partial<{
  messageUuid: string;
  streamUuid: string;
  topicUuid: string;
  orgId: string;
  projectId: string;
}>;

type WorkspacePushClickTargetInput = PushClickTargetInput & WorkspacePushRouteFields;

type WorkspacePushNotificationClickPayload = PushNotificationClickPayload &
  WorkspacePushRouteFields;

function normalizeRealmForComparison(realm: string): string {
  return realm
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api\/v1$/, "")
    .replace(/\/api$/, "")
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

function normalizeNonEmpty(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function buildInboxRoute(orgId?: string): string {
  const normalizedOrgId = normalizeNonEmpty(orgId);
  if (normalizedOrgId != null) {
    return withOrgRoutePrefix("/inbox", normalizedOrgId);
  }
  return withCurrentOrgRoute("/inbox");
}

function appendMessageFocus(route: string, messageId: number | undefined): string {
  if (messageId == null) return route;
  const separator = route.includes("?") ? "&" : "?";
  return `${route}${separator}msg=${messageId}`;
}

function buildLegacyStreamRoute(input: WorkspacePushClickTargetInput): string | null {
  const streamId = parsePositiveInt(input.streamId);
  const streamName = normalizeNonEmpty(input.streamName);
  if (streamName == null) {
    return null;
  }

  const streamRoute =
    streamId != null
      ? `/stream/${buildStreamSlug(streamId, streamName)}`
      : `/stream/${encodeURIComponent(streamName)}`;
  const topic = input.topic;
  const base =
    topic != null
      ? `${streamRoute}/topic/${encodeURIComponent(encodeTopicForRoute(topic))}`
      : streamRoute;
  return appendMessageFocus(withCurrentOrgRoute(base), parsePositiveInt(input.messageId));
}

function buildLegacyDmRoute(input: WorkspacePushClickTargetInput): string | null {
  if (input.type !== "private") {
    return null;
  }
  const senderId = parsePositiveInt(input.senderId);
  if (senderId == null) {
    return null;
  }
  return appendMessageFocus(
    withCurrentOrgRoute(`/dm/${senderId}`),
    parsePositiveInt(input.messageId),
  );
}

function buildWorkspaceMessageRoute(input: WorkspacePushClickTargetInput): string | null {
  const orgId = normalizeNonEmpty(input.orgId);
  const projectId = normalizeNonEmpty(input.projectId);
  const messageUuid = normalizeNonEmpty(input.messageUuid);
  if (orgId == null || projectId == null || messageUuid == null) {
    return null;
  }
  return workspaceMessengerMessageRoute({ orgId, projectId, messageUuid });
}

function buildWorkspaceStreamRoute(input: WorkspacePushClickTargetInput): string | null {
  const orgId = normalizeNonEmpty(input.orgId);
  const projectId = normalizeNonEmpty(input.projectId);
  const streamUuid = normalizeNonEmpty(input.streamUuid);
  if (orgId == null || projectId == null || streamUuid == null) {
    return null;
  }

  if (input.topic != null) {
    const topicUuid = normalizeNonEmpty(input.topicUuid);
    if (topicUuid == null) {
      return null;
    }
    return workspaceMessengerTopicRoute({ orgId, projectId, streamUuid, topicUuid });
  }

  return workspaceMessengerStreamRoute({ orgId, projectId, streamUuid });
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

export function buildPushClickUrl(input: WorkspacePushClickTargetInput): string {
  return (
    buildWorkspaceMessageRoute(input) ??
    buildWorkspaceStreamRoute(input) ??
    buildLegacyStreamRoute(input) ??
    buildLegacyDmRoute(input) ??
    buildInboxRoute(input.orgId)
  );
}

export function buildMessageRedirectRoute(
  messageId: number,
  realmUri?: string,
  workspace?: Pick<WorkspacePushRouteFields, "orgId" | "projectId" | "messageUuid">,
): string {
  const workspaceRoute = buildWorkspaceMessageRoute({
    messageId,
    messageUuid: workspace?.messageUuid,
    orgId: workspace?.orgId,
    projectId: workspace?.projectId,
  });
  if (workspaceRoute != null) {
    return workspaceRoute;
  }
  const fallback = withCurrentOrgRoute(`/message/${messageId}`);
  if (realmUri == null || realmUri.trim().length === 0) {
    return fallback;
  }
  return `${fallback}?realm=${encodeURIComponent(realmUri)}`;
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

export function buildRouteFromPushNotificationClick(
  payload: WorkspacePushNotificationClickPayload,
): string {
  const messageId = parsePositiveInt(payload.messageId);
  if (messageId != null || normalizeNonEmpty(payload.messageUuid) != null) {
    return buildMessageRedirectRoute(messageId ?? 0, payload.realmUri, {
      messageUuid: payload.messageUuid,
      orgId: payload.orgId,
      projectId: payload.projectId,
    });
  }

  const messageType =
    payload.messageType === "stream" || payload.messageType === "private"
      ? payload.messageType
      : undefined;

  return buildPushClickUrl({
    type: messageType,
    streamId: parsePositiveInt(payload.streamId),
    streamUuid: payload.streamUuid,
    streamName: typeof payload.streamName === "string" ? payload.streamName : undefined,
    topic: typeof payload.topic === "string" ? payload.topic : undefined,
    topicUuid: payload.topicUuid,
    senderId: parsePositiveInt(payload.senderId),
    orgId: payload.orgId,
    projectId: payload.projectId,
  });
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
