import type { MediaItem } from "~/features/media-viewer/media-viewer.types";
import type { MockMessage } from "~/shared/api/zulip.types";
import { AUTH_MEDIA_SRC_DATA_ATTR } from "~/shared/lib/protected-message-media";
import {
  isUserUploadImagePath,
  toUserUploadOriginalUrl,
} from "~/shared/lib/protected-message-media-thumbnail";
import { isUserUploadVideoPath, isVideoFileHref } from "~/shared/lib/user-upload-media-path.lib";

const IMG_SRC_REGEX = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
const VIDEO_SRC_REGEX = /<video\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
const SOURCE_SRC_REGEX = /<source\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
const A_HREF_REGEX = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const USER_UPLOAD_IMAGE_EXT = /\.(apng|avif|bmp|gif|jpe?g|png|svg|webp)(\?|#|$)/i;

export interface MessageMediaGallery {
  items: MediaItem[];
  indexByUrl: Map<string, number>;
}

export function normalizeMediaUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed === "") return "";
  if (trimmed.startsWith("blob:")) return trimmed;

  try {
    return new URL(trimmed, window.location.origin).href;
  } catch {
    return trimmed;
  }
}

function normalizeGalleryImageUrl(url: string): string {
  const normalized = normalizeMediaUrl(url);
  if (normalized === "" || !isUserUploadImagePath(normalized)) {
    return normalized;
  }
  return normalizeMediaUrl(toUserUploadOriginalUrl(normalized));
}

function isUserUploadImageHref(href: string): boolean {
  const value = href.trim();
  if (!value.includes("/user_uploads/")) return false;
  const pathOnly = value.split("?")[0]?.split("#")[0] ?? "";
  return USER_UPLOAD_IMAGE_EXT.test(pathOnly);
}

function extractUrlsFromRegex(
  content: string,
  regex: RegExp,
  accept: (raw: string) => boolean,
): string[] {
  const urls: string[] = [];
  regex.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const raw = match[1] ?? match[2] ?? match[3] ?? "";
    if (!accept(raw)) continue;
    const normalized = normalizeMediaUrl(raw);
    if (normalized !== "") {
      urls.push(normalized);
    }
  }

  return urls;
}

function extractImageUrls(content: string): string[] {
  return extractUrlsFromRegex(content, IMG_SRC_REGEX, () => true);
}

function extractVideoUrls(content: string): string[] {
  const fromVideo = extractUrlsFromRegex(content, VIDEO_SRC_REGEX, () => true);
  const fromSource = extractUrlsFromRegex(content, SOURCE_SRC_REGEX, isVideoFileHref);
  return [...fromVideo, ...fromSource];
}

function extractUserUploadImageLinkUrls(content: string): string[] {
  return extractUrlsFromRegex(content, A_HREF_REGEX, isUserUploadImageHref);
}

function extractUserUploadVideoLinkUrls(content: string): string[] {
  return extractUrlsFromRegex(content, A_HREF_REGEX, isUserUploadVideoPath);
}

function appendUniqueMedia(
  items: MediaItem[],
  indexByUrl: Map<string, number>,
  url: string,
  type: MediaItem["type"],
): void {
  const normalizedUrl = type === "image" ? normalizeGalleryImageUrl(url) : url;
  if (normalizedUrl === "" || indexByUrl.has(normalizedUrl)) return;
  indexByUrl.set(normalizedUrl, items.length);
  items.push({ url: normalizedUrl, type });
}

/** Resolves canonical media URL from an inline `<video>` (auth attr, then src, then child `<source>`). */
export function resolveVideoElementMediaUrl(video: HTMLVideoElement): string {
  const authOnVideo = video.getAttribute(AUTH_MEDIA_SRC_DATA_ATTR);
  if (authOnVideo != null && authOnVideo.trim() !== "") {
    return authOnVideo;
  }

  const directSrc = video.currentSrc || video.src;
  if (directSrc.trim() !== "") {
    return directSrc;
  }

  const source = video.querySelector("source");
  if (source == null) {
    return "";
  }

  const authOnSource = source.getAttribute(AUTH_MEDIA_SRC_DATA_ATTR);
  if (authOnSource != null && authOnSource.trim() !== "") {
    return authOnSource;
  }

  return source.src.trim();
}

export function buildMessageMediaGallery(messages: MockMessage[]): MessageMediaGallery {
  const items: MediaItem[] = [];
  const indexByUrl = new Map<string, number>();

  for (const message of messages) {
    const imageUrls = [
      ...extractImageUrls(message.content),
      ...extractUserUploadImageLinkUrls(message.content),
    ];
    for (const url of imageUrls) {
      appendUniqueMedia(items, indexByUrl, url, "image");
    }

    const videoUrls = [
      ...extractVideoUrls(message.content),
      ...extractUserUploadVideoLinkUrls(message.content),
    ];
    for (const url of videoUrls) {
      appendUniqueMedia(items, indexByUrl, url, "video");
    }
  }

  return { items, indexByUrl };
}
