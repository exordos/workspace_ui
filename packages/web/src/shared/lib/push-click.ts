import { withCurrentOrgRoute, withOrgRoutePrefix } from "~/shared/lib/org-route";
import {
  workspaceMessengerMessageRoute,
  workspaceMessengerStreamRoute,
  workspaceMessengerTopicRoute,
} from "~/shared/lib/workspace-messenger-route.lib";
import type {
  PushClickRouteResolution,
  PushClickTargetInput,
  PushNotificationClickPayload,
} from "./push-click.types";

export type {
  PushClickRouteResolution,
  PushClickTargetInput,
  PushNotificationClickPayload,
} from "./push-click.types";

function normalizeRealmForComparison(realm: string): string {
  return realm
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api\/v1$/, "")
    .replace(/\/api$/, "")
    .toLowerCase();
}

function normalizeNonEmpty(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function buildUnsupportedRoute(orgId?: string): string {
  const normalizedOrgId = normalizeNonEmpty(orgId);
  if (normalizedOrgId != null) {
    return withOrgRoutePrefix("/", normalizedOrgId);
  }
  return withCurrentOrgRoute("/");
}

function buildWorkspaceMessageRoute(input: PushClickTargetInput): string | null {
  const orgId = normalizeNonEmpty(input.orgId);
  const projectId = normalizeNonEmpty(input.projectId);
  const messageUuid = normalizeNonEmpty(input.messageUuid);
  if (orgId == null || projectId == null || messageUuid == null) {
    return null;
  }
  return workspaceMessengerMessageRoute({ orgId, projectId, messageUuid });
}

function buildWorkspaceStreamRoute(input: PushClickTargetInput): string | null {
  const orgId = normalizeNonEmpty(input.orgId);
  const projectId = normalizeNonEmpty(input.projectId);
  const streamUuid = normalizeNonEmpty(input.streamUuid);
  if (orgId == null || projectId == null || streamUuid == null) {
    return null;
  }

  const topicUuid = normalizeNonEmpty(input.topicUuid);
  if (topicUuid != null) {
    return workspaceMessengerTopicRoute({ orgId, projectId, streamUuid, topicUuid });
  }

  if (input.topic != null) {
    return null;
  }

  return workspaceMessengerStreamRoute({ orgId, projectId, streamUuid });
}

export function resolvePushClickRoute(input: PushClickTargetInput): PushClickRouteResolution {
  const route = buildWorkspaceMessageRoute(input) ?? buildWorkspaceStreamRoute(input);
  if (route != null) {
    return { kind: "route", route };
  }
  return {
    kind: "unsupported",
    reason: "workspace_route_context_missing",
    route: buildUnsupportedRoute(input.orgId),
  };
}

export function buildPushClickUrl(input: PushClickTargetInput): string {
  return resolvePushClickRoute(input).route;
}

export function buildRouteFromPushNotificationClick(payload: PushNotificationClickPayload): string {
  const messageType =
    payload.messageType === "stream" || payload.messageType === "private"
      ? payload.messageType
      : undefined;

  return buildPushClickUrl({
    type: messageType,
    messageUuid: payload.messageUuid,
    messageId: typeof payload.messageId === "number" ? payload.messageId : undefined,
    streamId: typeof payload.streamId === "number" ? payload.streamId : undefined,
    streamUuid: payload.streamUuid,
    streamName: typeof payload.streamName === "string" ? payload.streamName : undefined,
    topic: typeof payload.topic === "string" ? payload.topic : undefined,
    topicUuid: payload.topicUuid,
    senderId: typeof payload.senderId === "number" ? payload.senderId : undefined,
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
