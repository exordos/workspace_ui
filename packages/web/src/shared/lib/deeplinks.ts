/**
 * Deep link builder and parser.
 *
 * Generates shareable URLs for any content within the app.
 * Handles three runtimes:
 * - Web/PWA: standard URL paths (https://app.example.com/stream/5-general)
 * - Electron: custom protocol (workspace://open/stream/5-general)
 * - Internal: react-router paths (/stream/5-general)
 *
 * Usage:
 *   import { deeplink } from "~/lib/deeplinks";
 *
 *   deeplink.toStream(5, "general");          // "/inbox"
 *   deeplink.toTopic(5, "general", "bugs");   // "/inbox"
 *   deeplink.toDm(42);                        // "/inbox"
 *   deeplink.toActivity("starred");           // "/activity/starred"
 *   deeplink.toMessage(5, "general", 12345);  // "/inbox"
 *
 *   deeplink.toShareableUrl("/stream/5-general");  // "https://app.example.com/stream/5-general"
 *   deeplink.parse("workspace://open/dm/42");      // { type: "dm", dmId: "42" }
 *
 *   await deeplink.share({ title: "#general", url: shareUrl });
 */

import { writeText } from "./clipboard";
import { isElectron } from "./electron";
import { createLogger } from "./logger";
import { extractOrgRouteFromPathname, withCurrentOrgRoute, withOrgRoutePrefix } from "./org-route";
import { decodeTopicFromRoute } from "./topic-identity.lib";
import {
  workspaceMessengerMessageRoute,
  workspaceMessengerStreamRoute,
  workspaceMessengerTopicRoute,
} from "./workspace-messenger-route.lib";

const log = createLogger("deeplinks");

// ---------------------------------------------------------------------------
// Route builders (internal paths)
// ---------------------------------------------------------------------------

interface WorkspaceRouteScope {
  orgId?: string;
  projectId?: string;
}

interface WorkspaceStreamRouteScope extends WorkspaceRouteScope {
  streamUuid?: string;
}

interface WorkspaceTopicRouteScope extends WorkspaceStreamRouteScope {
  topicUuid?: string;
}

interface WorkspaceMessageRouteScope extends WorkspaceRouteScope {
  messageUuid?: string;
}

function normalizeNonEmpty(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function inboxRoute(scope?: WorkspaceRouteScope): string {
  const orgId = normalizeNonEmpty(scope?.orgId);
  if (orgId != null) {
    return withOrgRoutePrefix("/inbox", orgId);
  }
  return withCurrentOrgRoute("/inbox");
}

export function toStream(
  _streamId: number,
  _streamName: string,
  workspace?: WorkspaceStreamRouteScope,
): string {
  const orgId = normalizeNonEmpty(workspace?.orgId);
  const projectId = normalizeNonEmpty(workspace?.projectId);
  const streamUuid = normalizeNonEmpty(workspace?.streamUuid);
  if (orgId == null || projectId == null || streamUuid == null) {
    return inboxRoute(workspace);
  }
  return workspaceMessengerStreamRoute({ orgId, projectId, streamUuid });
}

export function toTopic(
  _streamId: number,
  _streamName: string,
  _topic: string,
  workspace?: WorkspaceTopicRouteScope,
): string {
  const orgId = normalizeNonEmpty(workspace?.orgId);
  const projectId = normalizeNonEmpty(workspace?.projectId);
  const streamUuid = normalizeNonEmpty(workspace?.streamUuid);
  const topicUuid = normalizeNonEmpty(workspace?.topicUuid);
  if (orgId == null || projectId == null || streamUuid == null || topicUuid == null) {
    return inboxRoute(workspace);
  }
  return workspaceMessengerTopicRoute({ orgId, projectId, streamUuid, topicUuid });
}

export function toMessage(
  _streamId: number,
  _streamName: string,
  _topic: string,
  _messageId: number,
  workspace?: WorkspaceMessageRouteScope,
): string {
  const orgId = normalizeNonEmpty(workspace?.orgId);
  const projectId = normalizeNonEmpty(workspace?.projectId);
  const messageUuid = normalizeNonEmpty(workspace?.messageUuid);
  if (orgId == null || projectId == null || messageUuid == null) {
    return inboxRoute(workspace);
  }
  return workspaceMessengerMessageRoute({ orgId, projectId, messageUuid });
}

export function toDm(_dmId: number | string): string {
  return withCurrentOrgRoute("/inbox");
}

export function toActivity(filter: "starred" | "mentions" | "reactions"): string {
  return withCurrentOrgRoute(`/activity/${filter}`);
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
  const scopedPath = withCurrentOrgRoute(internalPath);
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
  type:
    | "stream"
    | "topic"
    | "dm"
    | "activity"
    | "message"
    | "calendar"
    | "mail"
    | "calls"
    | "unknown";
  path: string;
  orgId?: string;
  streamSlug?: string;
  topicName?: string;
  dmId?: string;
  filter?: string;
  messageId?: number;
}

const DECIMAL_INTEGER_RE = /^\d+$/;

function parseMessageId(searchParams: URLSearchParams): number | undefined {
  const rawMessageId = searchParams.get("msg");
  if (rawMessageId == null) {
    return undefined;
  }
  if (!DECIMAL_INTEGER_RE.test(rawMessageId)) {
    return undefined;
  }
  const parsed = Number(rawMessageId);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

function decodeUriComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parse(url: string): ParsedDeepLink {
  let path: string;

  try {
    const parsed = new URL(url);
    if (parsed.protocol === `${CUSTOM_PROTOCOL}:`) {
      path = parsed.pathname.replace(/^\/open/, "") || "/";
    } else {
      path = parsed.pathname;
    }
  } catch {
    path = url.startsWith("/") ? url : `/${url}`;
  }

  const searchParams = new URLSearchParams(url.includes("?") ? url.split("?")[1] : "");
  const { orgId, scopedPathname } = extractOrgRouteFromPathname(path);

  if (scopedPathname.startsWith("/stream/")) {
    const parts = scopedPathname.replace("/stream/", "").split("/topic/");
    const hasTopicSegment = parts.length > 1;
    const streamSlug = parts[0];
    const topicNameRaw = parts[1] ? decodeUriComponentSafe(parts[1]) : undefined;
    const topicName = topicNameRaw != null ? decodeTopicFromRoute(topicNameRaw) : undefined;
    const messageId = parseMessageId(searchParams);

    if (messageId) {
      return { type: "message", path, orgId: orgId ?? undefined, streamSlug, topicName, messageId };
    }
    if (hasTopicSegment) {
      return { type: "topic", path, orgId: orgId ?? undefined, streamSlug, topicName };
    }
    return { type: "stream", path, orgId: orgId ?? undefined, streamSlug };
  }

  if (scopedPathname.startsWith("/dm/")) {
    return {
      type: "dm",
      path,
      orgId: orgId ?? undefined,
      dmId: scopedPathname.replace("/dm/", ""),
    };
  }

  if (scopedPathname.startsWith("/activity/")) {
    return {
      type: "activity",
      path,
      orgId: orgId ?? undefined,
      filter: scopedPathname.replace("/activity/", ""),
    };
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
