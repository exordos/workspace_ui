/**
 * Fetches avatar images with auth headers for private Zulip realms / gateways.
 * Uses same-origin relative paths in dev (Vite realm proxy) — mirrors protected-message-media.
 *
 * Usage:
 *   import { buildAvatarFetchUrl, fetchAvatarBlob, shouldNetworkFetchAvatarBlob } from "~/shared/lib/avatar-blob-fetch.lib";
 */
import { appendDevRealmMediaProxyHeaders } from "~/shared/api/client";
import { buildAuthHeader } from "~/shared/lib/auth-guard";
import { buildAvatarBlobCacheKey } from "~/shared/lib/avatar-blob-cache.lib";
import { env } from "~/shared/lib/env";
import { resolveProtectedUploadFetchOptions } from "~/shared/lib/protected-message-media";

/** Path + query for fetch (strips `_av`), relative in dev for same-origin proxy. */
export function buildAvatarFetchUrl(resolvedUrl: string): string {
  const trimmed = resolvedUrl.trim();
  const cacheKey = buildAvatarBlobCacheKey(trimmed);
  if (cacheKey == null) {
    return trimmed;
  }

  const useRelativeDevProxy =
    env.DEV && env.MODE === "development" && typeof window !== "undefined";
  if (useRelativeDevProxy) {
    return cacheKey;
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const parsed = new URL(trimmed);
      if (typeof window !== "undefined" && parsed.origin === window.location.origin) {
        return cacheKey;
      }
      return trimmed;
    } catch {
      return trimmed;
    }
  }

  return cacheKey;
}

/** When false, use direct `<img src>` — cross-origin fetch would fail CORS. */
export function shouldNetworkFetchAvatarBlob(resolvedUrl: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const fetchUrl = buildAvatarFetchUrl(resolvedUrl);
  try {
    const parsed = new URL(fetchUrl, window.location.origin);
    return parsed.origin === window.location.origin;
  } catch {
    return false;
  }
}

/** Downloads an avatar image as a Blob (best-effort). */
export async function fetchAvatarBlob(resolvedUrl: string): Promise<Blob | null> {
  const trimmed = resolvedUrl.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.startsWith("blob:") || trimmed.startsWith("data:")) return null;
  if (!shouldNetworkFetchAvatarBlob(trimmed)) {
    return null;
  }

  const fetchUrl = buildAvatarFetchUrl(trimmed);
  const headers = buildAuthHeader();
  const withDevProxy = appendDevRealmMediaProxyHeaders(fetchUrl, headers);

  try {
    const response = await fetch(
      fetchUrl,
      resolveProtectedUploadFetchOptions(fetchUrl, withDevProxy),
    );
    if (!response.ok) return null;
    return await response.blob();
  } catch {
    return null;
  }
}
