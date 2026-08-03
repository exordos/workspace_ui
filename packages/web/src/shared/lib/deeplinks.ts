/**
 * Deep link builder and parser.
 *
 * Generates shareable URLs for any content within the app.
 * Handles three runtimes:
 * - Web/PWA: standard URL paths
 * - Electron: custom protocol links
 * - Internal: react-router paths
 *
 * Usage:
 *   import { deeplink } from "~/lib/deeplinks";
 *
 *   deeplink.toActivity("starred", { orgId, projectId });
 *
 *   await deeplink.share({ title: "#general", url: shareUrl });
 */

import { writeText } from "./clipboard";
import { isElectron } from "./electron";
import { createLogger } from "./logger";
import { extractOrgRouteFromPathname, withCurrentOrgRoute, withOrgRoutePrefix } from "./org-route";
import {
  isLegacyMessengerPathname,
  workspaceMessengerMessageRoute,
  parseWorkspaceMessengerRoute,
  workspaceActivityRoute,
  workspaceMessengerStreamRoute,
  workspaceMessengerTopicRoute,
} from "./workspace-messenger-route.lib";

const log = createLogger("deeplinks");

// ---------------------------------------------------------------------------
// Route builders (internal paths)
// ---------------------------------------------------------------------------

export interface WorkspaceDeepLinkScope {
  orgId?: string;
  projectId?: string;
  streamUuid?: string;
  topicUuid?: string;
  messageUuid?: string;
}

function normalizeNonEmpty(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function safeFallbackRoute(scope?: WorkspaceDeepLinkScope): string {
  const orgId = normalizeNonEmpty(scope?.orgId);
  return orgId != null ? withOrgRoutePrefix("/", orgId) : withCurrentOrgRoute("/");
}

export function toStream(
  _streamId: number,
  _streamName: string,
  workspace?: WorkspaceDeepLinkScope,
): string {
  const orgId = normalizeNonEmpty(workspace?.orgId);
  const projectId = normalizeNonEmpty(workspace?.projectId);
  const streamUuid = normalizeNonEmpty(workspace?.streamUuid);
  if (orgId == null || projectId == null || streamUuid == null) {
    return safeFallbackRoute(workspace);
  }
  return workspaceMessengerStreamRoute({ orgId, projectId, streamUuid });
}

export function toTopic(
  _streamId: number,
  _streamName: string,
  _topic: string,
  workspace?: WorkspaceDeepLinkScope,
): string {
  const orgId = normalizeNonEmpty(workspace?.orgId);
  const projectId = normalizeNonEmpty(workspace?.projectId);
  const streamUuid = normalizeNonEmpty(workspace?.streamUuid);
  const topicUuid = normalizeNonEmpty(workspace?.topicUuid);
  if (orgId == null || projectId == null || streamUuid == null || topicUuid == null) {
    return safeFallbackRoute(workspace);
  }
  return workspaceMessengerTopicRoute({ orgId, projectId, streamUuid, topicUuid });
}

export function toMessage(
  _streamId: number,
  _streamName: string,
  _topic: string,
  _messageId: number,
  workspace?: WorkspaceDeepLinkScope,
): string {
  const orgId = normalizeNonEmpty(workspace?.orgId);
  const projectId = normalizeNonEmpty(workspace?.projectId);
  const messageUuid = normalizeNonEmpty(workspace?.messageUuid);
  if (orgId == null || projectId == null || messageUuid == null) {
    return safeFallbackRoute(workspace);
  }
  return workspaceMessengerMessageRoute({ orgId, projectId, messageUuid });
}

export function toDm(_dmId: number | string, workspace?: WorkspaceDeepLinkScope): string {
  const orgId = normalizeNonEmpty(workspace?.orgId);
  const projectId = normalizeNonEmpty(workspace?.projectId);
  const streamUuid = normalizeNonEmpty(workspace?.streamUuid);
  if (orgId == null || projectId == null || streamUuid == null) {
    return safeFallbackRoute(workspace);
  }
  const topicUuid = normalizeNonEmpty(workspace?.topicUuid);
  if (topicUuid != null) {
    return workspaceMessengerTopicRoute({ orgId, projectId, streamUuid, topicUuid });
  }
  return workspaceMessengerStreamRoute({ orgId, projectId, streamUuid });
}

export function toActivity(
  filter: "favorites" | "starred" | "mentions" | "reactions",
  workspace?: Pick<WorkspaceDeepLinkScope, "orgId" | "projectId">,
): string {
  const orgId = normalizeNonEmpty(workspace?.orgId);
  const projectId = normalizeNonEmpty(workspace?.projectId);
  if (orgId == null || projectId == null) return safeFallbackRoute(workspace);
  return workspaceActivityRoute({ orgId, projectId, filter });
}

export function toCalendar(): string {
  return withCurrentOrgRoute("/calendar");
}

export function toMail(): string {
  return withCurrentOrgRoute("/mail");
}

export function toCalls(): string {
  return withCurrentOrgRoute("/calls");
}

export function toLicenses(): string {
  return withCurrentOrgRoute("/licenses");
}

// ---------------------------------------------------------------------------
// Shareable URL (full external URL)
// ---------------------------------------------------------------------------

const CUSTOM_PROTOCOL = "ew";

export function toShareableUrl(internalPath: string): string {
  const scopedPath = withCurrentOrgRoute(normalizeShareablePath(internalPath));
  if (typeof window === "undefined") return scopedPath;

  if (isElectron()) {
    return `${CUSTOM_PROTOCOL}://open${scopedPath}`;
  }

  const origin = window.location.origin;
  return `${origin}${scopedPath}`;
}

// ---------------------------------------------------------------------------
// Parser (external deep link → internal route)
// ---------------------------------------------------------------------------

export interface ParsedDeepLink {
  type: "stream" | "topic" | "activity" | "message" | "calendar" | "mail" | "calls" | "unknown";
  path: string;
  orgId?: string;
  projectId?: string;
  streamUuid?: string;
  topicUuid?: string;
  messageUuid?: string;
  filter?: string;
}

function normalizeShareablePath(internalPath: string): string {
  const path = internalPath.trim();
  return isLegacyMessengerPathname(path) ? "/" : path;
}

export function parse(url: string): ParsedDeepLink {
  let path: string;

  try {
    const parsed = new URL(url, "https://workspace.invalid");
    if (parsed.protocol === `${CUSTOM_PROTOCOL}:`) {
      path = parsed.pathname.replace(/^\/open/, "") || "/";
    } else {
      path = parsed.pathname;
    }
  } catch {
    path = url.startsWith("/") ? url : `/${url}`;
  }

  const { orgId, scopedPathname } = extractOrgRouteFromPathname(path);

  const workspaceRoute = parseWorkspaceMessengerRoute(path);
  if (workspaceRoute != null) {
    if (workspaceRoute.kind === "stream") {
      return {
        type: "stream",
        path,
        orgId: workspaceRoute.orgId,
        projectId: workspaceRoute.projectId,
        streamUuid: workspaceRoute.streamUuid,
      };
    }
    if (workspaceRoute.kind === "topic") {
      return {
        type: "topic",
        path,
        orgId: workspaceRoute.orgId,
        projectId: workspaceRoute.projectId,
        streamUuid: workspaceRoute.streamUuid,
        topicUuid: workspaceRoute.topicUuid,
      };
    }
    if (workspaceRoute.kind === "message") {
      return {
        type: "message",
        path,
        orgId: workspaceRoute.orgId,
        projectId: workspaceRoute.projectId,
        messageUuid: workspaceRoute.messageUuid,
      };
    }
    if (workspaceRoute.kind === "activity") {
      return {
        type: "activity",
        path,
        orgId: workspaceRoute.orgId,
        projectId: workspaceRoute.projectId,
        filter: workspaceRoute.filter,
      };
    }
  }

  if (scopedPathname === "/calendar") return { type: "calendar", path, orgId: orgId ?? undefined };
  if (scopedPathname === "/mail") return { type: "mail", path, orgId: orgId ?? undefined };
  if (scopedPathname === "/calls") return { type: "calls", path, orgId: orgId ?? undefined };

  return { type: "unknown", path, orgId: orgId ?? undefined };
}

// ---------------------------------------------------------------------------
// Web Share API
// ---------------------------------------------------------------------------

export async function share(data: { title: string; url: string; text?: string }): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share(data);
      log.info("Shared via Web Share API", { title: data.title });
      return true;
    } catch {
      return false;
    }
  }

  try {
    const copied = await writeText(data.url);
    if (!copied) return false;
    log.info("Copied link to clipboard", { url: data.url });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Bundle
// ---------------------------------------------------------------------------

export const deeplink = {
  toStream,
  toTopic,
  toMessage,
  toDm,
  toActivity,
  toCalendar,
  toMail,
  toCalls,
  toLicenses,
  toShareableUrl,
  parse,
  share,
} as const;
