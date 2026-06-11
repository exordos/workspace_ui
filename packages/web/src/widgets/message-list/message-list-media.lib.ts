import type { MediaItem } from "~/features/media-viewer/media-viewer.types";
import type { MockMessage } from "~/shared/api/zulip.types";
import { normalizeUserUploadImageIdentity } from "~/shared/lib/message-inline-user-upload-image.lib";
import {
  isLikelyRenderedMessageHtml,
  messageBodyToUnsanitizedDisplayHtml,
} from "~/shared/lib/message-markdown-display.lib";
import { AUTH_MEDIA_SRC_DATA_ATTR } from "~/shared/lib/protected-message-media";
import {
  fromUserUploadThumbnailUrl,
  isUserUploadImagePath,
  isUserUploadThumbnailUrl,
  toUserUploadThumbnailUrl,
} from "~/shared/lib/protected-message-media-thumbnail";
import { isUserUploadVideoPath, isVideoFileHref } from "~/shared/lib/user-upload-media-path.lib";
import {
  collapseDuplicateWorkspaceV1InUrl,
  extractProtectedMessageMediaPathAndQuery,
} from "~/shared/lib/user-uploads-url.lib";
import { getMessageRealmBaseUrl } from "~/shared/lib/zulip-message-media-base.lib";

const IMG_SRC_REGEX = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
const VIDEO_SRC_REGEX = /<video\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
const SOURCE_SRC_REGEX = /<source\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
const A_HREF_REGEX = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const AUTH_SRC_REGEX = /data-auth-src\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
const MARKDOWN_LINK_REGEX = /!?\[([^\]]*)\]\(([^)\s]+)\)/g;
const USER_UPLOAD_IMAGE_EXT = /\.(apng|avif|bmp|gif|jpe?g|png|svg|webp)(\?|#|$)/i;

const GALLERY_IDENTITY_KEY_PREFIX = "identity:";

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

/** Canonical URL for gallery dedup and lookup (full-resolution user uploads, collapsed paths). */
export function canonicalGalleryMediaUrl(url: string): string {
  const normalized = normalizeMediaUrl(url);
  if (normalized === "" || normalized.startsWith("blob:")) {
    return normalized;
  }
  const collapsed = collapseDuplicateWorkspaceV1InUrl(normalized);
  if (isUserUploadThumbnailUrl(collapsed)) {
    return normalizeMediaUrl(fromUserUploadThumbnailUrl(collapsed));
  }
  return collapsed;
}

/** Stable lookup key: path-only for protected uploads, absolute URL otherwise. */
export function galleryMediaLookupKey(url: string): string {
  const trimmed = url.trim();
  if (trimmed === "") return "";
  if (trimmed.startsWith("blob:")) return trimmed;

  const protectedPath = extractProtectedMessageMediaPathAndQuery(trimmed);
  if (protectedPath != null) {
    const collapsed = collapseDuplicateWorkspaceV1InUrl(protectedPath);
    if (isUserUploadThumbnailUrl(collapsed)) {
      return fromUserUploadThumbnailUrl(collapsed);
    }
    return collapsed;
  }

  return canonicalGalleryMediaUrl(trimmed);
}

function resolveGalleryItemUrl(url: string, lookupKey: string): string {
  if (lookupKey.startsWith("/user_uploads/") || lookupKey.startsWith("/external_content/")) {
    const realm = getMessageRealmBaseUrl();
    if (realm != null && realm !== "") {
      return collapseDuplicateWorkspaceV1InUrl(`${realm}${lookupKey}`);
    }
  }
  return canonicalGalleryMediaUrl(url);
}

export function resolveGalleryMediaIndex(
  gallery: MessageMediaGallery,
  lookupUrl: string,
): number | undefined {
  const primaryKey = galleryMediaLookupKey(lookupUrl);
  if (primaryKey !== "") {
    const index = gallery.indexByUrl.get(primaryKey);
    if (index != null) return index;
  }

  const identity = normalizeUserUploadImageIdentity(lookupUrl);
  if (identity != null) {
    const index = gallery.indexByUrl.get(`${GALLERY_IDENTITY_KEY_PREFIX}${identity}`);
    if (index != null) return index;
  }

  const candidates = [normalizeMediaUrl(lookupUrl), canonicalGalleryMediaUrl(lookupUrl)];
  const canonical = canonicalGalleryMediaUrl(lookupUrl);
  if (
    canonical !== "" &&
    !canonical.startsWith("blob:") &&
    isUserUploadImagePath(canonical) &&
    !isUserUploadThumbnailUrl(canonical)
  ) {
    candidates.push(normalizeMediaUrl(toUserUploadThumbnailUrl(canonical)));
  }

  for (const candidate of candidates) {
    if (candidate === "") continue;
    const index = gallery.indexByUrl.get(candidate);
    if (index != null) return index;
  }
  return undefined;
}

export function resolveGalleryMediaIndexFromCandidates(
  gallery: MessageMediaGallery,
  candidates: readonly string[],
): number | undefined {
  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (trimmed === "") continue;
    const index = resolveGalleryMediaIndex(gallery, trimmed);
    if (index != null) return index;
  }
  return undefined;
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

function extractAuthSrcUrls(content: string): string[] {
  return extractUrlsFromRegex(content, AUTH_SRC_REGEX, () => true);
}

function extractMarkdownMediaUrls(content: string): string[] {
  const urls: string[] = [];
  if (!content.includes("/user_uploads/")) {
    return urls;
  }

  MARKDOWN_LINK_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MARKDOWN_LINK_REGEX.exec(content)) !== null) {
    const raw = match[2] ?? "";
    if (raw === "") continue;
    if (isUserUploadImageHref(raw) || isUserUploadVideoPath(raw)) {
      urls.push(raw);
    }
  }

  return urls;
}

function resolveMessageGalleryExtractionSource(message: MockMessage): string {
  const body = message.markdown_source ?? message.content;
  const treatAsMarkdown = message.markdown_source != null;
  const trimmed = body.trim();
  if (trimmed === "") return "";

  const renderedContent = message.content.trim();
  if (treatAsMarkdown && isLikelyRenderedMessageHtml(renderedContent)) {
    return message.content;
  }

  if (treatAsMarkdown || !isLikelyRenderedMessageHtml(trimmed)) {
    const renderedHtml = messageBodyToUnsanitizedDisplayHtml(body, {
      treatAsMarkdown,
      renderedContent: message.content,
    });
    return `${body}\n${renderedHtml}`;
  }

  return body;
}

function registerGalleryMediaLookupAliases(
  indexByUrl: Map<string, number>,
  index: number,
  url: string,
  lookupKey: string,
  type: MediaItem["type"],
): void {
  const normalized = normalizeMediaUrl(url);
  if (normalized !== "") {
    indexByUrl.set(normalized, index);
  }

  const canonical = canonicalGalleryMediaUrl(url);
  if (canonical !== "" && canonical !== lookupKey) {
    indexByUrl.set(canonical, index);
  }

  if (
    type === "image" &&
    lookupKey.startsWith("/user_uploads/") &&
    !isUserUploadThumbnailUrl(lookupKey)
  ) {
    indexByUrl.set(toUserUploadThumbnailUrl(lookupKey), index);
  }

  const identity = normalizeUserUploadImageIdentity(url);
  if (identity != null) {
    indexByUrl.set(`${GALLERY_IDENTITY_KEY_PREFIX}${identity}`, index);
  }
}
function registerGalleryMedia(
  items: MediaItem[],
  indexByUrl: Map<string, number>,
  url: string,
  type: MediaItem["type"],
): void {
  const lookupKey = galleryMediaLookupKey(url);
  if (lookupKey === "") return;

  let index = indexByUrl.get(lookupKey);
  if (index == null) {
    index = items.length;
    items.push({ url: resolveGalleryItemUrl(url, lookupKey), type });
    indexByUrl.set(lookupKey, index);
  }

  registerGalleryMediaLookupAliases(indexByUrl, index, url, lookupKey, type);
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
    const extractionSource = resolveMessageGalleryExtractionSource(message);
    const imageUrls = [
      ...extractImageUrls(extractionSource),
      ...extractUserUploadImageLinkUrls(extractionSource),
      ...extractAuthSrcUrls(extractionSource),
    ];
    for (const url of imageUrls) {
      registerGalleryMedia(items, indexByUrl, url, "image");
    }

    for (const url of extractMarkdownMediaUrls(extractionSource)) {
      registerGalleryMedia(items, indexByUrl, url, isUserUploadVideoPath(url) ? "video" : "image");
    }

    const videoUrls = [
      ...extractVideoUrls(extractionSource),
      ...extractUserUploadVideoLinkUrls(extractionSource),
    ];
    for (const url of videoUrls) {
      registerGalleryMedia(items, indexByUrl, url, "video");
    }
  }

  return { items, indexByUrl };
}
