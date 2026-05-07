/**
 * Avatar URL resolution with cache-busting.
 *
 * Consolidates avatar URL handling: resolves relative Zulip paths to absolute URLs
 * and appends a version query param that changes on bulk user refresh, forcing
 * browser revalidation of potentially stale avatar images.
 *
 * Usage:
 *   import { resolveAvatarUrl, bumpAvatarVersion } from "~/shared/lib/avatar";
 *   const src = resolveAvatarUrl(user.avatar_url, realmBaseUrl);
 */

let avatarVersion = 1;

/** Increment the global avatar version. Call after bulk user re-fetch (reconnect, login). */
export function bumpAvatarVersion(): void {
  avatarVersion++;
}

export function getAvatarVersion(): number {
  return avatarVersion;
}

/**
 * Resolves a potentially relative Zulip avatar URL to an absolute URL with cache-busting.
 * Returns undefined if the input is empty/null.
 */
export function resolveAvatarUrl(
  relativeUrl: string | undefined | null,
  realmBaseUrl?: string,
): string | undefined {
  if (!relativeUrl?.trim()) return undefined;
  const s = relativeUrl.trim();

  // Local preview URLs should be passed through as-is.
  if (s.startsWith("blob:") || s.startsWith("data:")) {
    return s;
  }

  let absolute: string;
  if (s.startsWith("http://") || s.startsWith("https://")) {
    absolute = s;
  } else if (realmBaseUrl) {
    const base = realmBaseUrl.replace(/\/+$/, "");
    absolute = `${base}${s.startsWith("/") ? s : `/${s}`}`;
  } else {
    return undefined;
  }

  const separator = absolute.includes("?") ? "&" : "?";
  return `${absolute}${separator}_av=${avatarVersion}`;
}
