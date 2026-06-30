/**
 * Persists the last opened Workspace messenger route per instance.
 *
 * Used when returning to the messenger section from the tray, top bar, or shortcuts.
 */
import { createLogger } from "~/shared/lib/logger";
import { extractOrgRouteFromPathname } from "~/shared/lib/org-route";

const log = createLogger("last-messenger-route");

const STORAGE_KEY = "workspace-last-messenger-route";
const WORKSPACE_MESSENGER_PATH =
  /^\/project\/([^/]+)\/(?:messenger|stream\/[^/]+(?:\/topic\/[^/]+)?|message\/[^/]+)\/?$/;

export interface MessengerNavigationContext {
  instanceId: string | null;
  projectId: string | null;
}

/** Internal route sent from Electron tray to open the last messenger chat. */
export const TRAY_MESSENGER_OPEN_ROUTE = "/open/messenger";

export function isTrayMessengerOpenRoute(route: string): boolean {
  return route === TRAY_MESSENGER_OPEN_ROUTE;
}

export function isPersistableMessengerChatPath(scopedPathname: string): boolean {
  return WORKSPACE_MESSENGER_PATH.test(scopedPathname);
}

/** Returns org-stripped `/project/:projectId/...` when the pathname is a Workspace messenger route. */
export function extractPersistableMessengerChatPath(pathname: string): string | null {
  const { scopedPathname } = extractOrgRouteFromPathname(pathname);
  if (!isPersistableMessengerChatPath(scopedPathname)) {
    return null;
  }
  return scopedPathname;
}

function routeProjectId(scopedPathname: string): string | null {
  const match = WORKSPACE_MESSENGER_PATH.exec(scopedPathname);
  if (!match?.[1]) {
    return null;
  }
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function normalizeProjectId(projectId: string | null): string | null {
  if (projectId == null) {
    return null;
  }
  const trimmed = projectId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function defaultWorkspaceMessengerPath(projectId: string): string {
  return `/project/${encodeURIComponent(projectId)}/messenger`;
}

function loadAll(): Record<string, string> {
  if (typeof window === "undefined") {
    return {};
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    log.warn("Failed to parse stored routes, resetting", { key: STORAGE_KEY });
    return {};
  }
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    log.warn("Stored routes have invalid shape, resetting", { key: STORAGE_KEY });
    return {};
  }
  const result: Record<string, string> = {};
  for (const [instanceId, route] of Object.entries(parsed)) {
    if (typeof route !== "string" || !isPersistableMessengerChatPath(route)) {
      continue;
    }
    result[instanceId] = route;
  }
  return result;
}

function saveAll(routes: Record<string, string>): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(routes));
  } catch (error) {
    log.warn("Failed to persist routes", { error: String(error) });
  }
}

export function loadLastMessengerRoute(instanceId: string): string | null {
  const route = loadAll()[instanceId];
  return route ?? null;
}

export function saveLastMessengerRoute(instanceId: string, scopedRoute: string): void {
  if (!isPersistableMessengerChatPath(scopedRoute)) {
    return;
  }
  const routes = loadAll();
  if (routes[instanceId] === scopedRoute) {
    return;
  }
  routes[instanceId] = scopedRoute;
  saveAll(routes);
}

export function clearLastMessengerRoutes(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    log.warn("Failed to clear routes", { error: String(error) });
  }
}

/** Org-stripped messenger path: last opened Workspace route, project root, or app root. */
export function resolveMessengerNavigationPath(context: MessengerNavigationContext): string {
  const projectId = normalizeProjectId(context.projectId);
  if (projectId == null) {
    return "/";
  }

  if (context.instanceId != null) {
    const saved = loadLastMessengerRoute(context.instanceId);
    if (saved != null && routeProjectId(saved) === projectId) {
      return saved;
    }
  }
  return defaultWorkspaceMessengerPath(projectId);
}
