import type { MediaItem } from "~/features/media-viewer/media-viewer.types";
import type { MockMessage } from "~/shared/api/messenger.types";
import { isImageFileName } from "~/shared/lib/media-file-name.lib";
import type { MessageId } from "~/shared/lib/message-id.lib";
import { normalizeUserUploadImageIdentity } from "~/shared/lib/message-inline-user-upload-image.lib";
import {
  isLikelyRenderedMessageHtml,
  messageBodyToUnsanitizedDisplayHtml,
} from "~/shared/lib/message-markdown-display.lib";
import { getMessageRealmBaseUrl } from "~/shared/lib/messenger-message-media-base.lib";
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
  isWorkspaceFileDownloadPath,
} from "~/shared/lib/user-uploads-url.lib";
import { parseWorkspaceFileUrn } from "~/shared/lib/workspace-file-urn.lib";

const IMG_SRC_REGEX = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
const VIDEO_SRC_REGEX = /<video\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
const SOURCE_SRC_REGEX = /<source\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
const A_HREF_REGEX = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const A_TAG_HREF_TEXT_REGEX =
  /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
const AUTH_SRC_REGEX = /data-auth-src\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
const MARKDOWN_LINK_REGEX = /!?\[([^\]]*)\]\(([^)\s]+)\)/g;
const USER_UPLOAD_IMAGE_EXT = /\.(apng|avif|bmp|gif|jpe?g|png|svg|webp)(\?|#|$)/i;
const MEDIA_FILE_EXTENSION_REGEX = /\.([a-z0-9]{2,5})(?:[?#]|$)/i;
const IMAGE_CONTENT_TYPE_EXTENSION: Record<string, string> = {
  "image/apng": "apng",
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp",
};
const VIDEO_CONTENT_TYPE_EXTENSION: Record<string, string> = {
  "video/mp4": "mp4",
  "video/ogg": "ogv",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-m4v": "m4v",
};

const GALLERY_IDENTITY_KEY_PREFIX = "identity:";

export interface MessageMediaGallery {
  items: MediaItem[];
  indexByUrl: Map<string, number>;
}

interface ExtractedMessageMediaUrls {
  imageUrls: string[];
  markdownMediaUrls: string[];
  videoUrls: string[];
  imageTotal: number;
  videoTotal: number;
}

export function normalizeMediaUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed === "") return "";
  const workspaceFileUrn = parseWorkspaceFileUrn(trimmed);
  const value = workspaceFileUrn?.downloadPath ?? trimmed;
  if (value.startsWith("blob:")) return value;

  try {
    return new URL(value, window.location.origin).href;
  } catch {
    return value;
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

  const workspaceFileUrn = parseWorkspaceFileUrn(trimmed);
  if (workspaceFileUrn != null) {
    return workspaceFileUrn.downloadPath;
  }

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

function isWorkspaceFileDownloadHref(href: string): boolean {
  const path = extractProtectedMessageMediaPathAndQuery(href);
  return path != null && isWorkspaceFileDownloadPath(path);
}

function isWorkspaceFileImageLink(label: string, href: string): boolean {
  return isWorkspaceFileDownloadHref(href) && isImageFileName(label);
}

function isWorkspaceFileImageUrn(href: string): boolean {
  const urn = parseWorkspaceFileUrn(href);
  if (urn == null) return false;
  return urn.kind === "image" || urn.contentType?.toLowerCase().startsWith("image/") === true;
}

function isWorkspaceFileVideoUrn(href: string): boolean {
  const urn = parseWorkspaceFileUrn(href);
  if (urn == null) return false;
  return urn.kind === "video" || urn.contentType?.toLowerCase().startsWith("video/") === true;
}

function isWorkspaceFileMediaUrn(href: string): boolean {
  return isWorkspaceFileImageUrn(href) || isWorkspaceFileVideoUrn(href);
}

function isMarkdownVideoMediaUrl(url: string): boolean {
  return isUserUploadVideoPath(url) || isWorkspaceFileVideoUrn(url);
}

function normalizeExtractedMediaUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  if (parseWorkspaceFileUrn(trimmed) != null) {
    return trimmed;
  }
  return normalizeMediaUrl(trimmed);
}

function contentTypeExtension(url: string, type: MediaItem["type"]): string | null {
  const contentType = parseWorkspaceFileUrn(url)?.contentType?.toLowerCase();
  if (contentType == null) return null;
  const extensions = type === "video" ? VIDEO_CONTENT_TYPE_EXTENSION : IMAGE_CONTENT_TYPE_EXTENSION;
  return extensions[contentType] ?? null;
}

function fileNameExtension(url: string): string | null {
  const name = parseWorkspaceFileUrn(url)?.name;
  const source = name != null && name !== "" ? name : url;
  const match = MEDIA_FILE_EXTENSION_REGEX.exec(source);
  const ext = match?.[1]?.toLowerCase();
  if (ext == null || ext === "") return null;
  return ext === "jpeg" ? "jpg" : ext;
}

function stripHtmlTags(value: string): string {
  return value.replace(/<[^>]*>/g, "").trim();
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
    const normalized = normalizeExtractedMediaUrl(raw);
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
  const fromSource = extractUrlsFromRegex(
    content,
    SOURCE_SRC_REGEX,
    (raw) => isVideoFileHref(raw) || isWorkspaceFileVideoUrn(raw),
  );
  return [...fromVideo, ...fromSource];
}

function extractUserUploadImageLinkUrls(content: string): string[] {
  return extractUrlsFromRegex(content, A_HREF_REGEX, isUserUploadImageHref);
}

function extractWorkspaceFileImageLinkUrls(content: string): string[] {
  const urls: string[] = [];
  if (!content.includes("/api/workspace/v1/messenger/files/") && !content.includes("urn:")) {
    return urls;
  }

  A_TAG_HREF_TEXT_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = A_TAG_HREF_TEXT_REGEX.exec(content)) !== null) {
    const raw = match[1] ?? match[2] ?? match[3] ?? "";
    const label = stripHtmlTags(match[4] ?? "");
    if (!isWorkspaceFileImageLink(label, raw) && !isWorkspaceFileImageUrn(raw)) continue;
    const normalized = normalizeExtractedMediaUrl(raw);
    if (normalized !== "") {
      urls.push(normalized);
    }
  }

  return urls;
}

function extractUserUploadVideoLinkUrls(content: string): string[] {
  return extractUrlsFromRegex(content, A_HREF_REGEX, isUserUploadVideoPath);
}

function extractWorkspaceFileVideoLinkUrls(content: string): string[] {
  if (!content.includes("urn:")) {
    return [];
  }
  return extractUrlsFromRegex(content, A_HREF_REGEX, isWorkspaceFileVideoUrn);
}

function extractAuthSrcUrls(content: string): string[] {
  return extractUrlsFromRegex(content, AUTH_SRC_REGEX, () => true);
}

function extractMarkdownMediaUrls(content: string): string[] {
  const urls: string[] = [];
  if (
    !content.includes("/user_uploads/") &&
    !content.includes("/api/workspace/v1/messenger/files/") &&
    !content.includes("urn:")
  ) {
    return urls;
  }

  MARKDOWN_LINK_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MARKDOWN_LINK_REGEX.exec(content)) !== null) {
    const label = match[1] ?? "";
    const raw = match[2] ?? "";
    if (raw === "") continue;
    if (
      isUserUploadImageHref(raw) ||
      isUserUploadVideoPath(raw) ||
      isWorkspaceFileImageLink(label, raw) ||
      isWorkspaceFileMediaUrn(raw)
    ) {
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
  downloadFileName?: string,
): void {
  const lookupKey = galleryMediaLookupKey(url);
  if (lookupKey === "") return;

  let index = indexByUrl.get(lookupKey);
  if (index == null) {
    index = items.length;
    items.push({
      url: resolveGalleryItemUrl(url, lookupKey),
      type,
      ...(downloadFileName != null && downloadFileName !== "" ? { downloadFileName } : {}),
    });
    indexByUrl.set(lookupKey, index);
  }

  registerGalleryMediaLookupAliases(indexByUrl, index, url, lookupKey, type);
}

function fileExtensionFromMediaUrl(url: string, type: MediaItem["type"]): string {
  const urnContentTypeExtension = contentTypeExtension(url, type);
  if (urnContentTypeExtension != null) {
    return urnContentTypeExtension;
  }

  const urnFileNameExtension = fileNameExtension(url);
  if (urnFileNameExtension != null) {
    return urnFileNameExtension;
  }

  const normalized = canonicalGalleryMediaUrl(url);
  const match = MEDIA_FILE_EXTENSION_REGEX.exec(normalized);
  const ext = match?.[1]?.toLowerCase();
  if (ext != null && ext !== "") {
    return ext === "jpeg" ? "jpg" : ext;
  }
  return type === "video" ? "mp4" : "png";
}

function buildGalleryDownloadFileName(
  messageId: MessageId,
  sequence: number,
  total: number,
  type: MediaItem["type"],
  url: string,
): string {
  const prefix = type === "video" ? "media" : "image";
  const counter = total > 1 ? `-${sequence}` : "";
  return `${prefix}-${messageId}${counter}.${fileExtensionFromMediaUrl(url, type)}`;
}

function countDistinctMessageMedia(urls: readonly string[]): number {
  const keys = new Set<string>();
  for (const url of urls) {
    const key = galleryMediaLookupKey(url);
    if (key !== "") {
      keys.add(key);
    }
  }
  return keys.size;
}

function nextMessageMediaSequence(seen: Set<string>, url: string): number | null {
  const key = galleryMediaLookupKey(url);
  if (key === "" || seen.has(key)) {
    return null;
  }
  seen.add(key);
  return seen.size;
}

function extractMessageMediaUrls(extractionSource: string): ExtractedMessageMediaUrls {
  const imageUrls = [
    ...extractImageUrls(extractionSource),
    ...extractUserUploadImageLinkUrls(extractionSource),
    ...extractWorkspaceFileImageLinkUrls(extractionSource),
    ...extractAuthSrcUrls(extractionSource),
  ];
  const markdownMediaUrls = extractMarkdownMediaUrls(extractionSource);
  const markdownImageUrls = markdownMediaUrls.filter((url) => !isMarkdownVideoMediaUrl(url));
  const markdownVideoUrls = markdownMediaUrls.filter((url) => isMarkdownVideoMediaUrl(url));
  const videoUrls = [
    ...extractVideoUrls(extractionSource),
    ...extractUserUploadVideoLinkUrls(extractionSource),
    ...extractWorkspaceFileVideoLinkUrls(extractionSource),
  ];

  return {
    imageUrls,
    markdownMediaUrls,
    videoUrls,
    imageTotal: countDistinctMessageMedia([...imageUrls, ...markdownImageUrls]),
    videoTotal: countDistinctMessageMedia([...markdownVideoUrls, ...videoUrls]),
  };
}

function registerMessageMediaUrl(
  items: MediaItem[],
  indexByUrl: Map<string, number>,
  messageId: MessageId,
  seenKeys: Set<string>,
  total: number,
  url: string,
  type: MediaItem["type"],
): void {
  const sequence = nextMessageMediaSequence(seenKeys, url);
  registerGalleryMedia(
    items,
    indexByUrl,
    url,
    type,
    sequence != null
      ? buildGalleryDownloadFileName(messageId, sequence, total, type, url)
      : undefined,
  );
}

function registerMessageMediaUrls(
  items: MediaItem[],
  indexByUrl: Map<string, number>,
  messageId: MessageId,
  mediaUrls: ExtractedMessageMediaUrls,
): void {
  const seenImageKeys = new Set<string>();
  const seenVideoKeys = new Set<string>();

  for (const url of mediaUrls.imageUrls) {
    registerMessageMediaUrl(
      items,
      indexByUrl,
      messageId,
      seenImageKeys,
      mediaUrls.imageTotal,
      url,
      "image",
    );
  }

  for (const url of mediaUrls.markdownMediaUrls) {
    const type = isMarkdownVideoMediaUrl(url) ? "video" : "image";
    registerMessageMediaUrl(
      items,
      indexByUrl,
      messageId,
      type === "video" ? seenVideoKeys : seenImageKeys,
      type === "video" ? mediaUrls.videoTotal : mediaUrls.imageTotal,
      url,
      type,
    );
  }

  for (const url of mediaUrls.videoUrls) {
    registerMessageMediaUrl(
      items,
      indexByUrl,
      messageId,
      seenVideoKeys,
      mediaUrls.videoTotal,
      url,
      "video",
    );
  }
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
    registerMessageMediaUrls(
      items,
      indexByUrl,
      message.id,
      extractMessageMediaUrls(extractionSource),
    );
  }

  return { items, indexByUrl };
}
