/**
 * Persists the last opened messenger chat (stream/DM route) per Zulip instance.
 *
 * Used when returning to the messenger section from the tray, top bar, or shortcuts.
 */
import { createLogger } from "~/shared/lib/logger";
import { extractOrgRouteFromPathname } from "~/shared/lib/org-route";

const log = createLogger("last-messenger-route");

const STORAGE_KEY = "workspace-last-messenger-route";
const MESSENGER_CHAT_PATH = /^\/(?:stream\/[^/]+(?:\/topic\/[^/]+)?|dm\/[^/]+)\/?$/;

/** Internal route sent from Electron tray to open the last messenger chat. */
export const TRAY_MESSENGER_OPEN_ROUTE = "/open/messenger";

export function isTrayMessengerOpenRoute(route: string): boolean {
  return route === TRAY_MESSENGER_OPEN_ROUTE;
}

export function isPersistableMessengerChatPath(scopedPathname: string): boolean {
  return MESSENGER_CHAT_PATH.test(scopedPathname);
}

/** Returns org-stripped `/stream/...` or `/dm/...` when the pathname is a messenger chat. */
export function extractPersistableMessengerChatPath(pathname: string): string | null {
  const { scopedPathname } = extractOrgRouteFromPathname(pathname);
  if (!isPersistableMessengerChatPath(scopedPathname)) {
    return null;
  }
  return scopedPathname;
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

/** Org-stripped messenger path: last opened chat or default stream slug fallback. */
export function resolveMessengerNavigationPath(
  instanceId: string | null,
  defaultStreamSlug: string,
): string {
  if (instanceId != null) {
    const saved = loadLastMessengerRoute(instanceId);
    if (saved != null) {
      return saved;
    }
  }
  return `/stream/${defaultStreamSlug}`;
}
