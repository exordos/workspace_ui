/**
 * In-memory CSRF token cache for Zulip cookie-session auth.
 */
import { normalizeRealm } from "./zulip-realm.internal";

const csrfTokensByRealm = new Map<string, string>();
const activeCsrfTokenFetchesByRealm = new Map<string, Promise<string | null>>();

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

export function parseSessionCsrfTokenFromHtml(html: string): string | null {
  if (typeof DOMParser === "undefined") {
    return null;
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  const field = doc.querySelector('[name="csrfmiddlewaretoken"]');
  if (field == null) {
    return null;
  }
  const rawValue =
    "value" in field && typeof field.value === "string"
      ? field.value
      : (field.getAttribute("value") ?? "");
  const token = rawValue.trim();
  return token.length > 0 ? token : null;
}

export async function getOrFetchWebSessionCsrfToken(realm: string): Promise<string | null> {
  const cachedToken = getCachedSessionCsrfToken(realm);
  if (cachedToken != null) {
    return cachedToken;
  }
  if (typeof window === "undefined" || typeof fetch === "undefined") {
    return null;
  }
  const cacheKey = cacheKeyForRealm(realm);
  const activeFetch = activeCsrfTokenFetchesByRealm.get(cacheKey);
  if (activeFetch != null) {
    return activeFetch;
  }

  const fetchPromise = (async (): Promise<string | null> => {
    try {
      const res = await fetch(`${window.location.origin}/legacy`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        return null;
      }
      const token = parseSessionCsrfTokenFromHtml(await res.text());
      if (token == null) {
        return null;
      }
      setCachedSessionCsrfToken(realm, token);
      return token;
    } catch {
      return null;
    } finally {
      activeCsrfTokenFetchesByRealm.delete(cacheKey);
    }
  })();
  activeCsrfTokenFetchesByRealm.set(cacheKey, fetchPromise);
  return fetchPromise;
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
