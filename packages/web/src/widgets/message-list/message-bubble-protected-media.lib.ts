/**
 * Helpers for loading Zulip user-upload media with auth (avoids browser basic-auth prompts).
 */
import { getRealmBaseUrl } from "~/shared/api/zulip-client.internal";

export const AUTH_MEDIA_SRC_DATA_ATTR = "data-auth-src";
export const AUTH_MEDIA_POSTER_DATA_ATTR = "data-auth-poster";
export const AUTH_IMAGE_PLACEHOLDER_SRC =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

export function isProtectedUserUploadUrl(url: string): boolean {
  const value = url.trim();
  if (value.length === 0) return false;
  if (value.includes("/user_uploads/")) return true;
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "https://localhost";
    return new URL(value, base).pathname.includes("/user_uploads/");
  } catch {
    return false;
  }
}

export function normalizeProtectedUploadPath(url: string): string | null {
  const value = url.trim();
  if (value.length === 0) return null;
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "https://localhost";
    const parsed = new URL(value, base);
    if (parsed.pathname.includes("/user_uploads/")) {
      const normalizedPath = parsed.pathname.replace(/^\/api\/v1(?=\/user_uploads\/)/, "");
      return `${normalizedPath}${parsed.search}`;
    }
  } catch {
    if (value.includes("/user_uploads/")) {
      return value.replace(/^\/api\/v1(?=\/user_uploads\/)/, "");
    }
  }
  return null;
}

export function buildProtectedUploadFetchCandidates(url: string): string[] {
  const value = url.trim();
  const normalizedPath = normalizeProtectedUploadPath(value);
  if (!normalizedPath) {
    return value.length > 0 ? [value] : [];
  }
  const realmBase = getRealmBaseUrl().trim().replace(/\/+$/, "");
  const candidates = [
    normalizedPath,
    value,
    realmBase ? `${realmBase}${normalizedPath}` : "",
  ].filter((candidate) => candidate.length > 0);
  return Array.from(new Set(candidates));
}

export function resolveProtectedUploadFetchOptions(
  candidate: string,
  headers: Record<string, string>,
): RequestInit {
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "https://localhost";
    const parsed = new URL(candidate, base);
    const isCrossOrigin = typeof window !== "undefined" && parsed.origin !== window.location.origin;
    if (isCrossOrigin) {
      return { credentials: "omit" };
    }
  } catch {
    // Ignore parse failures and use the authenticated same-origin options.
  }
  return { headers, credentials: "include" };
}

export async function fetchProtectedUploadBlob(
  rawValue: string,
  headers: Record<string, string>,
): Promise<Blob | null> {
  for (const candidate of buildProtectedUploadFetchCandidates(rawValue)) {
    try {
      const response = await fetch(
        candidate,
        resolveProtectedUploadFetchOptions(candidate, headers),
      );
      if (!response.ok) continue;
      return await response.blob();
    } catch {
      // Try the next candidate URL.
    }
  }
  return null;
}

export function protectUserUploadMediaSources(html: string): string {
  if (!html.includes("/user_uploads/") || typeof document === "undefined") return html;

  const container = document.createElement("div");
  container.innerHTML = html;

  const elementsWithSrc = container.querySelectorAll<HTMLElement>("[src]");
  for (const element of elementsWithSrc) {
    const src = element.getAttribute("src");
    if (!src || !isProtectedUserUploadUrl(src)) continue;

    element.setAttribute(AUTH_MEDIA_SRC_DATA_ATTR, src);
    if (element instanceof HTMLImageElement) {
      element.dataset.originalSrc = src;
      element.setAttribute("src", AUTH_IMAGE_PLACEHOLDER_SRC);
    } else {
      element.removeAttribute("src");
    }
  }

  const videosWithPoster = container.querySelectorAll<HTMLVideoElement>("video[poster]");
  for (const video of videosWithPoster) {
    const poster = video.getAttribute("poster");
    if (!poster || !isProtectedUserUploadUrl(poster)) continue;
    video.setAttribute(AUTH_MEDIA_POSTER_DATA_ATTR, poster);
    video.removeAttribute("poster");
  }

  return container.innerHTML;
}
