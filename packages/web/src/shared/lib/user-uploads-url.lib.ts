/**
 * Canonical base URLs for messenger message media (`/user_uploads/`, `/external_content/`).
 * Rewrites gateway hosts so SPA, Electron `file://`, and Vite dev-proxy behave the same.
 */

const USER_UPLOADS_SEGMENT = "/user_uploads/";
const EXTERNAL_CONTENT_SEGMENT = "/external_content/";
const WORKSPACE_FILE_DOWNLOAD_PREFIX = "/api/workspace/v1/messenger/files/";
const WORKSPACE_FILE_DOWNLOAD_SUFFIX = "/actions/download";
const PROTECTED_MESSAGE_MEDIA_SEGMENTS = [
  WORKSPACE_FILE_DOWNLOAD_PREFIX,
  USER_UPLOADS_SEGMENT,
  EXTERNAL_CONTENT_SEGMENT,
] as const;

export function collapseDuplicateWorkspaceV1InUrl(raw: string): string {
  let s = raw.trim();
  while (s.includes("/api/workspace/v1/api/workspace/v1")) {
    s = s.replace(/\/api\/workspace\/v1\/api\/workspace\/v1/g, "/api/workspace/v1");
  }
  return s;
}

export function getDefaultUrlParseBase(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "https://localhost";
}

function pathnameFromFirstProtectedMessageMediaSegment(pathname: string): string {
  let bestIndex = -1;
  for (const segment of PROTECTED_MESSAGE_MEDIA_SEGMENTS) {
    const idx = pathname.indexOf(segment);
    if (idx === -1) continue;
    if (bestIndex === -1 || idx < bestIndex) {
      bestIndex = idx;
    }
  }
  if (bestIndex === -1) return pathname;
  return pathname.slice(bestIndex);
}

export function isUserUploadsPath(pathname: string): boolean {
  return pathname.includes(USER_UPLOADS_SEGMENT);
}

export function isExternalContentPath(pathname: string): boolean {
  return pathname.includes(EXTERNAL_CONTENT_SEGMENT);
}

export function isWorkspaceFileDownloadPath(pathname: string): boolean {
  const idx = pathname.indexOf(WORKSPACE_FILE_DOWNLOAD_PREFIX);
  if (idx === -1) return false;
  const path = pathname.slice(idx);
  return (
    path.endsWith(WORKSPACE_FILE_DOWNLOAD_SUFFIX) ||
    path.endsWith(`${WORKSPACE_FILE_DOWNLOAD_SUFFIX}/`)
  );
}

export function isProtectedMessageMediaPath(pathname: string): boolean {
  return (
    isUserUploadsPath(pathname) ||
    isExternalContentPath(pathname) ||
    isWorkspaceFileDownloadPath(pathname)
  );
}

export function extractProtectedMessageMediaPathAndQuery(
  raw: string,
  base: string = getDefaultUrlParseBase(),
): string | null {
  const value = raw.trim();
  if (value.length === 0) return null;
  try {
    const parsed = new URL(value, base);
    if (!isProtectedMessageMediaPath(parsed.pathname)) return null;
    const normalizedPath = pathnameFromFirstProtectedMessageMediaSegment(parsed.pathname);
    return `${normalizedPath}${parsed.search}`;
  } catch {
    if (isProtectedMessageMediaPath(value)) {
      try {
        const parsed = new URL(value, base);
        const normalizedPath = pathnameFromFirstProtectedMessageMediaSegment(parsed.pathname);
        return `${normalizedPath}${parsed.search}`;
      } catch {
        const q = value.indexOf("?");
        const pathOnly = q === -1 ? value : value.slice(0, q);
        const search = q === -1 ? "" : value.slice(q);
        return `${pathnameFromFirstProtectedMessageMediaSegment(pathOnly)}${search}`;
      }
    }
  }
  return null;
}

export function extractUserUploadsPathAndQuery(
  raw: string,
  base: string = getDefaultUrlParseBase(),
): string | null {
  const pathAndQuery = extractProtectedMessageMediaPathAndQuery(raw, base);
  return pathAndQuery != null && isUserUploadsPath(pathAndQuery) ? pathAndQuery : null;
}

export function rewriteProtectedMessageMediaUrlToCanonical(
  src: string,
  canonicalBase: string,
): string {
  const base = canonicalBase.trim().replace(/\/+$/, "");
  if (base === "") return src;
  const trimmed = src.trim();
  if (!isProtectedMessageMediaPath(trimmed)) return src;
  if (trimmed.startsWith("data:")) return trimmed;

  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return trimmed.startsWith("/") ? `${base}${trimmed}` : `${base}/${trimmed}`;
  }

  const pathAndQuery = extractProtectedMessageMediaPathAndQuery(trimmed, base);
  if (!pathAndQuery) return src;
  return collapseDuplicateWorkspaceV1InUrl(`${base}${pathAndQuery}`);
}

export function rewriteUserUploadMediaUrlToCanonical(
  src: string,
  canonicalUploadsBase: string,
): string {
  const base = canonicalUploadsBase.trim().replace(/\/+$/, "");
  if (base === "") return src;
  const trimmed = src.trim();
  if (!isUserUploadsPath(trimmed)) return src;
  if (trimmed.startsWith("data:")) return trimmed;

  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return trimmed.startsWith("/") ? `${base}${trimmed}` : `${base}/${trimmed}`;
  }

  const pathAndQuery = extractUserUploadsPathAndQuery(trimmed, base);
  if (!pathAndQuery) return src;
  return collapseDuplicateWorkspaceV1InUrl(`${base}${pathAndQuery}`);
}
