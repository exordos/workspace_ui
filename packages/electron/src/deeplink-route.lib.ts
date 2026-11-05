/** Shared validation for renderer-controlled internal navigation routes. */

const MAX_DEEPLINK_ROUTE_LENGTH = 512;

/** Rejects routes that could be used for script injection or external navigation. */
export function isSafeDeeplinkRoute(route: string): boolean {
  const trimmed = route.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_DEEPLINK_ROUTE_LENGTH) return false;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower.startsWith("vbscript:"))
    return false;
  if (trimmed.includes("//")) return false;
  return true;
}

export function resolveNotificationClickRoute(options: unknown): string | null {
  if (options == null || typeof options !== "object" || Array.isArray(options)) {
    return null;
  }
  const clickRoute = (options as { clickRoute?: unknown }).clickRoute;
  if (typeof clickRoute !== "string") {
    return null;
  }
  const trimmed = clickRoute.trim();
  return isSafeDeeplinkRoute(trimmed) ? trimmed : null;
}

/** Validate only the external protocol boundary; tray and notification routes keep their contracts. */
export function parseExternalDeepLink(value: string): string | null {
  if (/[\\\u0000-\u0020]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "ew:" ||
      url.hostname !== "open" ||
      url.port ||
      url.username ||
      url.password
    )
      return null;
    const route = `${url.pathname || "/"}${url.search}${url.hash}`;
    if (!route.startsWith("/") || !isSafeDeeplinkRoute(route)) return null;
    if (/%(?:2f|5c|00|0a|0d)/i.test(route)) return null;
    const messageSegment = /\/message\/([^/?#]+)/.exec(url.pathname)?.[1];
    if (
      messageSegment != null &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(messageSegment)
    )
      return null;
    // Accept the existing service routes and complete project messenger routes.
    if (/^\/org\/[^/?#]+\/?$/.test(route)) return route;
    if (
      /^\/(?:calendar|mail|calls|licenses|settings|logs)\/?(?:[?#].*)?$/.test(route) ||
      route === "/"
    )
      return route;
    if (/^\/org\/[^/]+\/(?:calendar|mail|calls|licenses|settings|logs)\/?(?:[?#].*)?$/.test(route))
      return route;
    if (
      /^\/org\/[^/]+\/project\/[^/]+\/(?:messenger|inbox|feed|activity\/[^/]+|message\/[^/]+|stream\/[^/]+(?:\/topic\/[^/]+)?)\/?(?:[?#].*)?$/.test(
        route,
      )
    )
      return route;
    return null;
  } catch {
    return null;
  }
}

/** Last route wins while the renderer has no navigation subscriber. */
export function createDeepLinkDelivery() {
  let pending: string | null = null;
  let ready = false;
  return {
    enqueue(route: string) {
      pending = route;
    },
    setReady(value: boolean) {
      ready = value;
    },
    take(): string | null {
      if (!ready) return null;
      const route = pending;
      pending = null;
      return route;
    },
  };
}
