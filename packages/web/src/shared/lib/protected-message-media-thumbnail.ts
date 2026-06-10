/**
 * Zulip user-upload thumbnail URLs (server-generated WebP previews).
 *
 * Full: `{prefix}/user_uploads/{id}/{shard}/{name}.png`
 * Thumb: `{prefix}/user_uploads/thumbnail/{id}/{shard}/{name}.png/840x560.webp`
 */

import {
  canonicalizeUserUploadImagePath,
  isUserUploadImagePath,
} from "~/shared/lib/message-inline-user-upload-image.lib";
import { collapseDuplicateWorkspaceV1InUrl } from "~/shared/lib/user-uploads-url.lib";

export { canonicalizeUserUploadImagePath, isUserUploadImagePath };

export const USER_UPLOAD_THUMBNAIL_SIZE = "840x560.webp";

export const USER_UPLOAD_THUMBNAIL_INTRINSIC_WIDTH = 840;
export const USER_UPLOAD_THUMBNAIL_INTRINSIC_HEIGHT = 560;

/** Display dimensions scaled from 840×560 to max height 160px inside bubbles. */
export const USER_UPLOAD_THUMBNAIL_DISPLAY_MAX_WIDTH = 240;
export const USER_UPLOAD_THUMBNAIL_DISPLAY_MAX_HEIGHT = 160;

export function isUserUploadThumbnailUrl(url: string): boolean {
  const v = url.trim();
  if (v.length === 0) return false;
  return v.includes("/user_uploads/thumbnail/");
}

const PATH_BEFORE_USER_UPLOADS = /^(.*?)\/user_uploads\/(?!thumbnail\/)(.+)$/;

const THUMBNAIL_PATH_WITH_SIZE = /^(.*?)\/user_uploads\/thumbnail\/(.+)\/840x560\.webp$/;

export function fromUserUploadThumbnailUrl(url: string): string {
  const trimmed = collapseDuplicateWorkspaceV1InUrl(url.trim());
  if (trimmed.length === 0 || !isUserUploadThumbnailUrl(trimmed)) {
    return trimmed;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      const m = THUMBNAIL_PATH_WITH_SIZE.exec(u.pathname);
      if (m?.[2] == null || m[2] === "") {
        return trimmed;
      }
      const before = m[1] ?? "";
      u.pathname = `${before}/user_uploads/${m[2]}`;
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
  const m = THUMBNAIL_PATH_WITH_SIZE.exec(basePart);
  if (m?.[2] == null || m[2] === "") {
    return trimmed;
  }
  const before = m[1] ?? "";
  return `${before}/user_uploads/${m[2]}${tail}`;
}

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

export function toUserUploadOriginalUrl(url: string): string {
  const trimmed = collapseDuplicateWorkspaceV1InUrl(url);
  if (trimmed.length === 0 || !isUserUploadThumbnailUrl(trimmed)) {
    return trimmed;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      const canonicalPath = canonicalizeUserUploadImagePath(u.pathname);
      if (canonicalPath == null) {
        return trimmed;
      }
      u.pathname = canonicalPath;
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
  const canonicalPath = canonicalizeUserUploadImagePath(basePart);
  if (canonicalPath == null) {
    return trimmed;
  }
  return `${canonicalPath}${tail}`;
}
