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
