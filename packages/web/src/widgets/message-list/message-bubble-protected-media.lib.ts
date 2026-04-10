/**
 * Helpers for loading Zulip user-upload media with auth (avoids browser basic-auth prompts).
 */
import { getRealmBaseUrl } from "~/shared/api/zulip-client.internal";
import {
  appendUserUploadsPathPrefix,
  normalizeRealmSiteOriginForUploads,
} from "~/shared/api/zulip-realm.internal";
import { env } from "~/shared/lib/env";

import {
  isUserUploadImagePath,
  isUserUploadThumbnailUrl,
  toUserUploadThumbnailUrl,
} from "./message-bubble-user-upload-thumbnail.lib";

export const AUTH_MEDIA_SRC_DATA_ATTR = "data-auth-src";
export const AUTH_MEDIA_POSTER_DATA_ATTR = "data-auth-poster";
export const AUTH_IMAGE_PLACEHOLDER_SRC =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

/** Whether `src` / `poster` is still the 1×1 placeholder (awaiting blob or fallback URL). */
export function isAuthMediaPlaceholderAttr(value: string | null): boolean {
  if (value == null || value === "") return true;
  return value === AUTH_IMAGE_PLACEHOLDER_SRC;
}

/** Collapses mistaken `/workspace/v1/workspace/v1/` (and repeats) in upload URLs. */
export function collapseDuplicateWorkspaceV1InUrl(raw: string): string {
  let s = raw.trim();
  while (s.includes("/workspace/v1/workspace/v1")) {
    s = s.replace(/\/workspace\/v1\/workspace\/v1/g, "/workspace/v1");
  }
  return s;
}

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

/** In Vite dev server, only same-origin candidates hit the `/user_uploads` proxy (no CORS). */
function preferViteDevProxyCandidates(candidates: string[]): string[] {
  const useViteDevUploadProxy =
    env.DEV && env.MODE === "development" && typeof window !== "undefined";
  if (!useViteDevUploadProxy) {
    return candidates;
  }
  const pageOrigin = window.location.origin;
  const sameOrigin: string[] = [];
  for (const c of candidates) {
    try {
      const resolved = new URL(c, pageOrigin);
      if (resolved.origin === pageOrigin) {
        sameOrigin.push(c);
      }
    } catch {
      sameOrigin.push(c);
    }
  }
  return sameOrigin.length > 0 ? sameOrigin : candidates;
}

export function buildProtectedUploadFetchCandidates(url: string): string[] {
  const value = collapseDuplicateWorkspaceV1InUrl(url);
  const normalizedPath = normalizeProtectedUploadPath(value);
  if (!normalizedPath) {
    const fallback =
      value.length > 0 ? [collapseDuplicateWorkspaceV1InUrl(value)] : [];
    return preferViteDevProxyCandidates(fallback);
  }
  const site = normalizeRealmSiteOriginForUploads(getRealmBaseUrl()).trim().replace(/\/+$/, "");
  const prefix = env.USER_UPLOADS_PATH_PREFIX;
  const uploadsBase =
    site !== "" ? appendUserUploadsPathPrefix(site, prefix) : "";
  const candidates = [
    normalizedPath,
    value,
    uploadsBase !== "" ? `${uploadsBase}${normalizedPath}` : "",
  ]
    .filter((candidate) => candidate.length > 0)
    .map(collapseDuplicateWorkspaceV1InUrl);
  return Array.from(new Set(preferViteDevProxyCandidates(candidates)));
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
      // Still send Basic auth: Zulip may answer CORS preflight with Allow-Headers: authorization.
      // Omitting `headers` here always produced 401 on cross-origin deployments (SPA host ≠ realm).
      return { headers, credentials: "omit" };
    }
  } catch {
    // Ignore parse failures and use the authenticated same-origin options.
  }
  return { headers, credentials: "include" };
}

function mergeFetchCandidateLists(primary: string, fallbackFullUrl?: string): string[] {
  const a = buildProtectedUploadFetchCandidates(primary);
  const collapsedPrimary = collapseDuplicateWorkspaceV1InUrl(primary);
  const collapsedFallback =
    fallbackFullUrl != null && fallbackFullUrl.trim() !== ""
      ? collapseDuplicateWorkspaceV1InUrl(fallbackFullUrl)
      : "";
  if (collapsedFallback === "" || collapsedFallback === collapsedPrimary) {
    return a;
  }
  const b = buildProtectedUploadFetchCandidates(fallbackFullUrl!);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of [...a, ...b]) {
    if (seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

/**
 * @param rawValue — Primary URL to fetch (often a thumbnail in dev).
 * @param fallbackFullUrl — Optional full-resolution image URL; tried if primary candidates fail.
 */
export async function fetchProtectedUploadBlob(
  rawValue: string,
  headers: Record<string, string>,
  fallbackFullUrl?: string,
): Promise<Blob | null> {
  for (const candidate of mergeFetchCandidateLists(rawValue, fallbackFullUrl)) {
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

    const collapsedSrc = collapseDuplicateWorkspaceV1InUrl(src);
    const fullResolutionSrc = collapsedSrc;
    const useThumb =
      element instanceof HTMLImageElement &&
      isUserUploadImagePath(collapsedSrc) &&
      !isUserUploadThumbnailUrl(collapsedSrc);
    const authFetchSrc = useThumb ? toUserUploadThumbnailUrl(collapsedSrc) : collapsedSrc;

    element.setAttribute(AUTH_MEDIA_SRC_DATA_ATTR, authFetchSrc);
    if (element instanceof HTMLImageElement) {
      element.dataset.originalSrc = fullResolutionSrc;
      element.setAttribute("src", AUTH_IMAGE_PLACEHOLDER_SRC);
    } else {
      element.removeAttribute("src");
    }
  }

  const videosWithPoster = container.querySelectorAll<HTMLVideoElement>("video[poster]");
  for (const video of videosWithPoster) {
    const poster = video.getAttribute("poster");
    if (!poster || !isProtectedUserUploadUrl(poster)) continue;
    video.setAttribute(AUTH_MEDIA_POSTER_DATA_ATTR, collapseDuplicateWorkspaceV1InUrl(poster));
    video.removeAttribute("poster");
  }

  return container.innerHTML;
}
