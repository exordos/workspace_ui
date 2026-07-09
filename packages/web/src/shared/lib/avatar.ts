/**
 * Avatar URL resolution with cache-busting.
 *
 * Consolidates avatar URL handling: resolves relative Workspace paths and backend
 * avatar URNs to absolute URLs and appends a version query param that changes on
 * bulk user refresh, forcing browser revalidation of potentially stale avatar images.
 *
 * Usage:
 *   import { resolveAvatarUrl, bumpAvatarVersion } from "~/shared/lib/avatar";
 *   const src = resolveAvatarUrl(user.avatar_url, realmBaseUrl);
 */
import { buildWorkspaceFileDownloadPath } from "~/shared/lib/workspace-file-urn.lib";

let avatarVersion = 1;

const WORKSPACE_GAVATAR_PREFIX = "urn:gavatar:";
const WORKSPACE_IMAGE_AVATAR_PREFIX = "urn:image:";
const WORKSPACE_URL_AVATAR_PREFIX = "urn:url:";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Increment the global avatar version. Call after bulk user re-fetch (reconnect, login). */
export function bumpAvatarVersion(): void {
  avatarVersion++;
}

export function getAvatarVersion(): number {
  return avatarVersion;
}

function resolveGeneratedAvatarUrn(value: string): string | undefined {
  if (!value.toLowerCase().startsWith(WORKSPACE_GAVATAR_PREFIX)) return undefined;
  const userUuid = value.slice(WORKSPACE_GAVATAR_PREFIX.length).trim().toLowerCase();
  if (!UUID_RE.test(userUuid)) return undefined;
  const hash = userUuid.replace(/-/g, "");
  return `https://secure.gravatar.com/avatar/${hash}?d=identicon&version=${avatarVersion}&s=500`;
}

function resolveWorkspaceImageAvatarUrn(
  value: string,
  realmBaseUrl: string | undefined,
): string | undefined {
  if (!value.toLowerCase().startsWith(WORKSPACE_IMAGE_AVATAR_PREFIX)) return undefined;
  const fileUuid = value.slice(WORKSPACE_IMAGE_AVATAR_PREFIX.length).trim().toLowerCase();
  if (!UUID_RE.test(fileUuid)) return undefined;
  return resolveAvatarUrl(buildWorkspaceFileDownloadPath(fileUuid), realmBaseUrl);
}

function resolveWorkspaceUrlAvatarUrn(value: string): string | undefined {
  if (!value.toLowerCase().startsWith(WORKSPACE_URL_AVATAR_PREFIX)) return undefined;
  const url = value.slice(WORKSPACE_URL_AVATAR_PREFIX.length).trim();
  return url.startsWith("http://") || url.startsWith("https://") ? url : undefined;
}

/**
 * Resolves a potentially relative Workspace avatar URL/URN to an absolute URL with cache-busting.
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

  const generatedAvatar = resolveGeneratedAvatarUrn(s);
  if (generatedAvatar != null) {
    return generatedAvatar;
  }

  const imageAvatar = resolveWorkspaceImageAvatarUrn(s, realmBaseUrl);
  if (imageAvatar != null) {
    return imageAvatar;
  }

  const urlAvatar = resolveWorkspaceUrlAvatarUrn(s);
  if (urlAvatar != null) {
    const separator = urlAvatar.includes("?") ? "&" : "?";
    return `${urlAvatar}${separator}_av=${avatarVersion}`;
  }

  if (s.toLowerCase().startsWith("urn:")) {
    return undefined;
  }

  let absolute: string;
  if (s.startsWith("http://") || s.startsWith("https://")) {
    absolute = s;
  } else if (realmBaseUrl) {
    const base = realmBaseUrl.replace(/\/+$/, "");
    const path = s.startsWith("/") ? s : "/" + s;
    absolute = `${base}${path}`;
  } else {
    return undefined;
  }

  const separator = absolute.includes("?") ? "&" : "?";
  return `${absolute}${separator}_av=${avatarVersion}`;
}
