/**
 * In-memory CSRF token cache for Zulip cookie-session auth.
 */
import { normalizeRealm } from "./zulip-realm.internal";

const csrfTokensByRealm = new Map<string, string>();

function cacheKeyForRealm(realm: string): string {
  return normalizeRealm(realm);
}

export function getCachedSessionCsrfToken(realm: string): string | null {
  return csrfTokensByRealm.get(cacheKeyForRealm(realm)) ?? null;
}

export function setCachedSessionCsrfToken(realm: string, token: string): void {
  const normalizedToken = token.trim();
  if (normalizedToken.length === 0) {
    return;
  }
  csrfTokensByRealm.set(cacheKeyForRealm(realm), normalizedToken);
}

function readCookieValue(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?:^|; )${escapedName}=([^;]*)`);
  const match = document.cookie.match(pattern);
  if (!match) {
    return null;
  }
  try {
    return decodeURIComponent(match[1] ?? "");
  } catch {
    return match[1] ?? null;
  }
}

export function readSessionCsrfTokenFromDocument(): string | null {
  return (
    readCookieValue("__Host-csrftoken") ?? readCookieValue("csrftoken") ?? readCookieValue("csrf")
  );
}
