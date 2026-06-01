/**
 * Classifies Zulip user-upload paths by media kind (image vs video).
 * Used by message galleries, right-panel counters, and attachment handling.
 */

export const USER_UPLOAD_VIDEO_EXT_RE = /\.(?:mp4|mov|webm|m4v|avi|mkv)(?:\?|#|$)/i;

function normalizedPathForExtensionCheck(raw: string): string {
  const trimmed = raw.trim();
  let pathOnly = trimmed.split("?")[0]?.split("#")[0] ?? "";
  try {
    pathOnly = decodeURIComponent(pathOnly);
  } catch {
    // keep pathOnly as-is when decode fails
  }
  return pathOnly;
}

/** True when `href` points at a video file under `/user_uploads/`. */
export function isUserUploadVideoPath(src: string): boolean {
  const v = src.trim();
  if (!v.includes("/user_uploads/")) return false;
  return USER_UPLOAD_VIDEO_EXT_RE.test(normalizedPathForExtensionCheck(v));
}

/** True when `href` ends with a known video file extension (any origin). */
export function isVideoFileHref(href: string): boolean {
  return USER_UPLOAD_VIDEO_EXT_RE.test(normalizedPathForExtensionCheck(href));
}

/** MIME type for `<source type>` from a user-upload video path or URL. */
export function userUploadVideoMimeType(src: string): string {
  const pathOnly = src.trim().split("?")[0]?.split("#")[0] ?? "";
  const ext = pathOnly.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "webm":
      return "video/webm";
    case "mov":
      return "video/quicktime";
    case "mkv":
      return "video/x-matroska";
    case "avi":
      return "video/x-msvideo";
    case "m4v":
    case "mp4":
      return "video/mp4";
    default:
      return "video/mp4";
  }
}
