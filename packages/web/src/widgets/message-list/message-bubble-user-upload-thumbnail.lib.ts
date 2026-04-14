/**
 * Zulip user-upload thumbnail URLs (server-generated WebP previews).
 *
 * Full file: `{optional prefix}/user_uploads/{id}/{shard}/{name}.png`
 * Thumbnail: `{same prefix}/user_uploads/thumbnail/{id}/{shard}/{name}.png/840x560.webp`
 */

import { collapseDuplicateWorkspaceV1InUrl } from "~/shared/lib/user-uploads-url.lib";

const USER_UPLOAD_IMAGE_EXT = /\.(apng|avif|bmp|gif|jpe?g|png|svg|webp)(\?|#|$)/i;

export const USER_UPLOAD_THUMBNAIL_SIZE = "840x560.webp";

/** Intrinsic pixel size of Zulip’s server-generated thumbnail file (`840x560.webp`). */
export const USER_UPLOAD_THUMBNAIL_INTRINSIC_WIDTH = 840;
export const USER_UPLOAD_THUMBNAIL_INTRINSIC_HEIGHT = 560;

/**
 * Reserved `width`/`height` on inline `<img>` in the chat bubble: same aspect ratio as the
 * Zulip thumbnail (840×560), scaled to match the bubble max displayed height (160px).
 */
export const USER_UPLOAD_THUMBNAIL_DISPLAY_MAX_WIDTH = 240;
export const USER_UPLOAD_THUMBNAIL_DISPLAY_MAX_HEIGHT = 160;

/** Whether the path looks like an image user-upload (eligible for server thumbnail URL). */
export function isUserUploadImagePath(src: string): boolean {
  const v = src.trim();
  if (!v.includes("/user_uploads/")) return false;
  const pathOnly = v.split("?")[0]?.split("#")[0] ?? "";
  return USER_UPLOAD_IMAGE_EXT.test(pathOnly);
}

export function isUserUploadThumbnailUrl(url: string): boolean {
  const v = url.trim();
  if (v.length === 0) return false;
  return v.includes("/user_uploads/thumbnail/");
}

const PATH_BEFORE_USER_UPLOADS = /^(.*?)\/user_uploads\/(?!thumbnail\/)(.+)$/;

/**
 * Builds thumbnail URL for a full user-upload image URL. Returns `fullUrl` unchanged if already
 * a thumbnail or if the path cannot be parsed.
 */
export function toUserUploadThumbnailUrl(fullUrl: string): string {
  const trimmed = collapseDuplicateWorkspaceV1InUrl(fullUrl);
  if (trimmed.length === 0 || isUserUploadThumbnailUrl(trimmed)) {
    return trimmed;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      const m = PATH_BEFORE_USER_UPLOADS.exec(u.pathname);
      if (m?.[2] == null || m[2] === "") {
        return trimmed;
      }
      const before = m[1] ?? "";
      const rest = m[2];
      u.pathname = `${before}/user_uploads/thumbnail/${rest}/${USER_UPLOAD_THUMBNAIL_SIZE}`;
      return u.toString();
    } catch {
      return trimmed;
    }
  }

  const q = trimmed.indexOf("?");
  const hash = trimmed.indexOf("#");
  let cut = trimmed.length;
  if (q >= 0) cut = Math.min(cut, q);
  if (hash >= 0) cut = Math.min(cut, hash);
  const basePart = trimmed.slice(0, cut);
  const tail = trimmed.slice(cut);
  const m = PATH_BEFORE_USER_UPLOADS.exec(basePart);
  if (m?.[2] == null || m[2] === "") {
    return trimmed;
  }
  const before = m[1] ?? "";
  const rest = m[2];
  return `${before}/user_uploads/thumbnail/${rest}/${USER_UPLOAD_THUMBNAIL_SIZE}${tail}`;
}
