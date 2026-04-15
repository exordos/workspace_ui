/**
 * Helpers for loading Zulip user-upload media with auth (avoids browser basic-auth prompts).
 */
import { appendDevUserUploadsProxyHeaders } from "~/shared/api/client";
import { getRealmBaseUrl } from "~/shared/api/zulip-client.internal";
import {
  appendUserUploadsPathPrefix,
  normalizeRealmSiteOriginForUploads,
  shouldApplyUserUploadsPathPrefixForRealmBase,
} from "~/shared/api/zulip-realm.internal";
import { env } from "~/shared/lib/env";
import {
  collapseDuplicateWorkspaceV1InUrl,
  extractUserUploadsPathAndQuery,
} from "~/shared/lib/user-uploads-url.lib";

export { collapseDuplicateWorkspaceV1InUrl };

import {
  isUserUploadImagePath,
  isUserUploadThumbnailUrl,
  toUserUploadThumbnailUrl,
  USER_UPLOAD_THUMBNAIL_DISPLAY_MAX_HEIGHT,
  USER_UPLOAD_THUMBNAIL_DISPLAY_MAX_WIDTH,
} from "./message-bubble-user-upload-thumbnail.lib";

export const AUTH_MEDIA_SRC_DATA_ATTR = "data-auth-src";
export const AUTH_MEDIA_POSTER_DATA_ATTR = "data-auth-poster";

/**
 * Replaces `<img src>` with the inline placeholder and `data-auth-src` (thumbnail when applicable).
 * Call this instead of assigning a bare `https://…/user_uploads/…` to `src` on a detached node:
 * assigning a real URL first can trigger a browser image request during `innerHTML` / DOM parse
 * before the authenticated `fetch` path runs.
 */
export function prepareProtectedUserUploadImageElement(
  img: HTMLImageElement,
  srcAttrValue: string,
): void {
  const collapsedSrc = collapseDuplicateWorkspaceV1InUrl(srcAttrValue);
  const fullResolutionSrc = collapsedSrc;
  const useThumb = isUserUploadImagePath(collapsedSrc) && !isUserUploadThumbnailUrl(collapsedSrc);
  const authFetchSrc = useThumb ? toUserUploadThumbnailUrl(collapsedSrc) : collapsedSrc;

  img.setAttribute(AUTH_MEDIA_SRC_DATA_ATTR, authFetchSrc);
  img.dataset.originalSrc = fullResolutionSrc;
  img.setAttribute("src", AUTH_IMAGE_PLACEHOLDER_SRC);
  if (isUserUploadThumbnailUrl(authFetchSrc)) {
    img.setAttribute("width", String(USER_UPLOAD_THUMBNAIL_DISPLAY_MAX_WIDTH));
    img.setAttribute("height", String(USER_UPLOAD_THUMBNAIL_DISPLAY_MAX_HEIGHT));
  }
}

/**
 * 160×160 decorative SVG placeholder (gradient + frame icon). Inline `data:` — no extra request
 * before authenticated fetch; colors are neutral so it reads acceptably on dark chat bubbles.
 */
const AUTH_IMAGE_PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160" aria-hidden="true">
  <defs>
    <linearGradient id="ph" x1="0" y1="0" x2="160" y2="160" gradientUnits="userSpaceOnUse">
      <stop stop-color="#252528"/>
      <stop offset="0.45" stop-color="#323238"/>
      <stop offset="1" stop-color="#28282c"/>
    </linearGradient>
    <linearGradient id="phg" x1="32" y1="24" x2="128" y2="136" gradientUnits="userSpaceOnUse">
      <stop stop-color="#ffffff" stop-opacity="0.04"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="160" height="160" rx="10" fill="url(#ph)"/>
  <rect width="160" height="160" rx="10" fill="url(#phg)"/>
  <rect x="52" y="48" width="56" height="44" rx="5" fill="none" stroke="#8b8b93" stroke-opacity="0.35" stroke-width="1.25"/>
  <circle cx="64" cy="60" r="5" fill="#8b8b93" fill-opacity="0.35"/>
  <path d="M56 84 L72 68 L84 80 L96 64 L104 84 Z" fill="#8b8b93" fill-opacity="0.22"/>
  <line x1="48" y1="112" x2="112" y2="112" stroke="#6b6b72" stroke-opacity="0.2" stroke-width="2" stroke-linecap="round"/>
</svg>`;

export const AUTH_IMAGE_PLACEHOLDER_SRC = `data:image/svg+xml,${encodeURIComponent(AUTH_IMAGE_PLACEHOLDER_SVG)}`;

/** Whether `src` / `poster` is still the auth placeholder image (awaiting blob or fallback URL). */
export function isAuthMediaPlaceholderAttr(value: string | null): boolean {
  if (value == null || value === "") return true;
  return value === AUTH_IMAGE_PLACEHOLDER_SRC;
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
  return extractUserUploadsPathAndQuery(url);
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
    const fallback = value.length > 0 ? [collapseDuplicateWorkspaceV1InUrl(value)] : [];
    return preferViteDevProxyCandidates(fallback);
  }
  const realm = getRealmBaseUrl();
  const site = normalizeRealmSiteOriginForUploads(realm).trim().replace(/\/+$/, "");
  const prefix = env.USER_UPLOADS_PATH_PREFIX;
  const uploadsBase =
    site !== ""
      ? shouldApplyUserUploadsPathPrefixForRealmBase(realm, site)
        ? appendUserUploadsPathPrefix(site, prefix)
        : site
      : "";
  const canonicalFull = uploadsBase !== "" ? `${uploadsBase}${normalizedPath}` : "";
  const candidates = [canonicalFull, normalizedPath, value]
    .filter((candidate) => candidate.length > 0)
    .map(collapseDuplicateWorkspaceV1InUrl);
  return Array.from(new Set(preferViteDevProxyCandidates(candidates)));
}

export function resolveProtectedUploadFetchOptions(
  candidate: string,
  headers: Record<string, string>,
): RequestInit {
  const withDevUploadProxy = appendDevUserUploadsProxyHeaders(candidate, headers);
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "https://localhost";
    const parsed = new URL(candidate, base);
    const isCrossOrigin = typeof window !== "undefined" && parsed.origin !== window.location.origin;
    if (isCrossOrigin) {
      // Still send Basic auth: Zulip may answer CORS preflight with Allow-Headers: authorization.
      // Omitting `headers` here always produced 401 on cross-origin deployments (SPA host ≠ realm).
      return { headers: withDevUploadProxy, credentials: "omit" };
    }
  } catch {
    // Ignore parse failures and use the authenticated same-origin options.
  }
  return { headers: withDevUploadProxy, credentials: "include" };
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

/** Avoid huge `data:` strings in DOM if a full-resolution fetch slips through on `file://`. */
const FILE_PROTOCOL_BLOB_AS_DATA_URL_MAX_BYTES = 15 * 1024 * 1024;

/**
 * Builds a value suitable for `<img src>` / `poster` after an authenticated `fetch` of a `Blob`.
 * On `file://` (packaged Electron), `URL.createObjectURL` yields `blob:file:///…`, which Chromium
 * does not treat as loadable media; use a `data:` URL when the blob is below a size cap.
 */
export async function createDisplayableBlobUrl(
  blob: Blob,
  revokeRegistry: string[],
): Promise<string> {
  const preferDataUrl =
    typeof window !== "undefined" &&
    window.location.protocol === "file:" &&
    blob.size <= FILE_PROTOCOL_BLOB_AS_DATA_URL_MAX_BYTES;

  if (!preferDataUrl) {
    const url = URL.createObjectURL(blob);
    revokeRegistry.push(url);
    return url;
  }

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const r = reader.result;
      if (typeof r === "string") {
        resolve(r);
        return;
      }
      reject(reader.error ?? new Error("FileReader: expected data URL string"));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("FileReader failed"));
    };
    reader.readAsDataURL(blob);
  });
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

    if (element instanceof HTMLImageElement) {
      prepareProtectedUserUploadImageElement(element, src);
      continue;
    }

    element.setAttribute(AUTH_MEDIA_SRC_DATA_ATTR, collapsedSrc);
    element.removeAttribute("src");
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
