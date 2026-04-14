/**
 * Canonical URLs for Zulip `/user_uploads/` media.
 *
 * Message HTML may contain absolute links to a gateway or legacy host that does not serve files
 * (e.g. 501). Rewriting to the same base as {@link getMessageImagesBaseUrl} aligns the SPA,
 * Electron `file://`, and Vite dev proxy behavior.
 */

/** Collapses mistaken `/workspace/v1/workspace/v1/` (and repeats) in upload URLs. */
export function collapseDuplicateWorkspaceV1InUrl(raw: string): string {
  let s = raw.trim();
  while (s.includes("/workspace/v1/workspace/v1")) {
    s = s.replace(/\/workspace\/v1\/workspace\/v1/g, "/workspace/v1");
  }
  return s;
}

/** Base URL for resolving relative paths in `parseUserUploadsUrl` when `window` is unavailable. */
export function getDefaultUrlParseBase(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "https://localhost";
}

/**
 * Drops gateway or API segments before the first `/user_uploads/` so the path is always
 * `/user_uploads/...` (Vite dev proxy matches `/user_uploads`, not `/workspace/v1/user_uploads`).
 */
function pathnameFromFirstUserUploadsSegment(pathname: string): string {
  const idx = pathname.indexOf("/user_uploads/");
  if (idx === -1) return pathname;
  return pathname.slice(idx);
}

/**
 * Returns `/user_uploads/...` plus query string from a full or relative URL, or null if not an
 * upload path.
 */
export function extractUserUploadsPathAndQuery(
  raw: string,
  base: string = getDefaultUrlParseBase(),
): string | null {
  const value = raw.trim();
  if (value.length === 0) return null;
  try {
    const parsed = new URL(value, base);
    if (!parsed.pathname.includes("/user_uploads/")) return null;
    let normalizedPath = parsed.pathname.replace(/^\/api\/v1(?=\/user_uploads\/)/, "");
    normalizedPath = pathnameFromFirstUserUploadsSegment(normalizedPath);
    return `${normalizedPath}${parsed.search}`;
  } catch {
    if (value.includes("/user_uploads/")) {
      try {
        const parsed = new URL(value, base);
        let normalizedPath = parsed.pathname.replace(/^\/api\/v1(?=\/user_uploads\/)/, "");
        normalizedPath = pathnameFromFirstUserUploadsSegment(normalizedPath);
        return `${normalizedPath}${parsed.search}`;
      } catch {
        const stripped = value.replace(/^\/api\/v1(?=\/user_uploads\/)/, "");
        const q = stripped.indexOf("?");
        const pathOnly = q === -1 ? stripped : stripped.slice(0, q);
        const search = q === -1 ? "" : stripped.slice(q);
        return `${pathnameFromFirstUserUploadsSegment(pathOnly)}${search}`;
      }
    }
  }
  return null;
}

/**
 * Rewrites any `.../user_uploads/...` URL to sit under `canonicalUploadsBase` (realm + optional
 * gateway prefix). Relative paths are resolved against that base. Non-upload absolute URLs are
 * unchanged.
 */
export function rewriteUserUploadMediaUrlToCanonical(
  src: string,
  canonicalUploadsBase: string,
): string {
  const base = canonicalUploadsBase.trim().replace(/\/+$/, "");
  if (base === "") return src;
  const trimmed = src.trim();
  if (!trimmed.includes("/user_uploads/")) return src;
  if (trimmed.startsWith("data:")) return trimmed;

  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return trimmed.startsWith("/") ? `${base}${trimmed}` : `${base}/${trimmed}`;
  }

  const pathAndQuery = extractUserUploadsPathAndQuery(trimmed, base);
  if (!pathAndQuery) return src;
  return collapseDuplicateWorkspaceV1InUrl(`${base}${pathAndQuery}`);
}
