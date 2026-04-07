const INTERNAL_DEEPLINK_BASE_URL = "https://workspace.local";
const MAX_DEEPLINK_ROUTE_LENGTH = 512;

/**
 * Normalizes and validates routes coming from Electron deeplink IPC.
 *
 * Returns a canonical internal route (always slash-prefixed) or `null` when
 * the value looks unsafe (external/protocol-relative/script URL).
 */
export function normalizeElectronDeeplinkRoute(route: string): string | null {
  const trimmed = route.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_DEEPLINK_ROUTE_LENGTH) {
    return null;
  }

  try {
    const base = new URL(INTERNAL_DEEPLINK_BASE_URL);
    const parsed = new URL(trimmed, base);
    if (parsed.protocol !== base.protocol || parsed.origin !== base.origin) {
      return null;
    }

    const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    if (!normalized.startsWith("/") || normalized.includes("//")) {
      return null;
    }

    return normalized;
  } catch {
    return null;
  }
}
