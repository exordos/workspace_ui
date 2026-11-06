import { isElectron } from "./electron";
import { env } from "./env";
import {
  parseWorkspaceMessengerRoute,
  workspaceMessengerMessageRoute,
} from "./workspace-messenger-route.lib";
import { isWorkspaceUuid } from "./workspace-reference-urn.lib";

export interface WorkspaceMessageLinkScope {
  orgId: string;
  projectId: string;
  messageUuid: string;
}

function webOrigin(value: string | undefined, allowPath = false): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
    if (
      url.username ||
      url.password ||
      (!allowPath && url.pathname !== "/") ||
      url.search ||
      url.hash
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Split-host installations override the same-origin deployment default explicitly. */
export function resolveWorkspaceMessageWebOrigin(
  options: {
    configuredOrigin?: string;
    browserOrigin?: string;
    organizationOrigin?: string;
  } = {},
): string | null {
  const configured = options.configuredOrigin ?? import.meta.env.VITE_WORKSPACE_WEB_ORIGIN;
  if (configured) return webOrigin(configured);
  if (isElectron()) {
    return (
      webOrigin(env.DEFAULT_LOGIN_ORGANIZATION_URL, true) ?? webOrigin(options.organizationOrigin)
    );
  }
  const browserOrigin =
    options.browserOrigin ?? (typeof window !== "undefined" ? window.location.origin : undefined);
  return webOrigin(browserOrigin ?? options.organizationOrigin);
}

function hasControlCharacters(value: string): boolean {
  return Array.from(value).some(
    (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
  );
}

function messagePath(scope: WorkspaceMessageLinkScope): string | null {
  if (!isWorkspaceUuid(scope.messageUuid)) return null;
  if (
    ![scope.orgId, scope.projectId, scope.messageUuid].every(
      (value) =>
        value.length > 0 &&
        value === value.trim() &&
        !/[\\/\s%?#]/.test(value) &&
        !hasControlCharacters(value) &&
        value !== "." &&
        value !== "..",
    )
  )
    return null;
  return workspaceMessengerMessageRoute(scope);
}

export function buildWorkspaceMessagePermalink(
  origin: string | undefined | null,
  scope: WorkspaceMessageLinkScope,
): string | null {
  const normalizedOrigin = webOrigin(origin ?? undefined);
  const path = messagePath(scope);
  return normalizedOrigin && path ? `${normalizedOrigin}${path}` : null;
}

export function buildWorkspaceMessageDesktopLink(scope: WorkspaceMessageLinkScope): string | null {
  const path = messagePath(scope);
  return path ? `ew://open${path}` : null;
}

export function parseWorkspaceMessagePermalink(
  value: string,
  trustedOrigins: readonly string[],
): (WorkspaceMessageLinkScope & { path: string }) | null {
  if (value !== value.trim() || /[\\\s]/.test(value) || hasControlCharacters(value)) return null;
  const relative = value.startsWith("/") && !value.startsWith("//");
  try {
    const url = new URL(value, "https://workspace.invalid");
    if (url.username || url.password || url.search || url.hash) return null;
    if (!relative && !trustedOrigins.some((origin) => webOrigin(origin) === url.origin))
      return null;
    const route = parseWorkspaceMessengerRoute(url.pathname);
    if (route?.kind !== "message") return null;
    const path = messagePath(route);
    if (path == null || (url.pathname !== path && url.pathname !== `${path}/`)) return null;
    return { orgId: route.orgId, projectId: route.projectId, messageUuid: route.messageUuid, path };
  } catch {
    return null;
  }
}
