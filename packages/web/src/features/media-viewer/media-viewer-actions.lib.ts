/**
 * Media viewer actions: open in new tab and download.
 *
 * Uses resolved display URLs (blob or public) — never raw protected URLs without auth.
 */

import { buildAuthHeader } from "~/shared/lib/auth-guard";
import { guard } from "~/shared/lib/guards";
import {
  AUTH_IMAGE_PLACEHOLDER_SRC,
  fetchProtectedUploadBlob,
  isProtectedMessageMediaUrl,
  resolveProtectedUploadFetchOptions,
  buildProtectedUploadFetchUrl,
} from "~/shared/lib/protected-message-media";
import { isValidUrl, sanitizeFilename } from "~/shared/lib/validation";
import type { MediaItem } from "./media-viewer.types";

const SAFE_MEDIA_DATA_URL_PATTERN =
  /^data:(?:image\/(?:png|jpe?g|gif|webp|avif|bmp)|video\/(?:mp4|webm|ogg));/i;
const GENERIC_MEDIA_FILE_NAMES = new Set([
  "image",
  "image.png",
  "image.jpg",
  "image.jpeg",
  "image.webp",
  "image.gif",
  "image.avif",
  "image.bmp",
  "media",
  "media.mp4",
  "video",
  "video.mp4",
]);

function safeDecodeUriComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function fileNameFromUrl(url: string): string {
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "https://localhost";
    const pathname = new URL(url, base).pathname;
    const segment = pathname.split("/").at(-1)?.trim() ?? "";
    if (segment === "") return "";
    return safeDecodeUriComponent(segment);
  } catch {
    return "";
  }
}

function isGenericMediaFileName(fileName: string): boolean {
  return GENERIC_MEDIA_FILE_NAMES.has(fileName.trim().toLowerCase());
}

export function deriveMediaFileName(item: MediaItem): string {
  const fromAlt = sanitizeFilename((item.alt ?? "").trim());
  const fromUrl = sanitizeFilename(fileNameFromUrl(item.url));
  const primary = fromAlt || fromUrl;
  if (primary && !isGenericMediaFileName(primary)) return primary;

  const fromItem = sanitizeFilename((item.downloadFileName ?? "").trim());
  if (fromItem) return fromItem;

  if (primary) return primary;

  return item.type === "video" ? "media.mp4" : "image";
}

export function canUseMediaViewerDisplayUrl(displayUrl: string | undefined): boolean {
  if (displayUrl == null || displayUrl.trim() === "") return false;
  if (displayUrl === AUTH_IMAGE_PLACEHOLDER_SRC) return false;
  return (
    displayUrl.startsWith("blob:") ||
    SAFE_MEDIA_DATA_URL_PATTERN.test(displayUrl) ||
    isValidUrl(displayUrl)
  );
}

function triggerBrowserDownload(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.rel = "noopener";
    anchor.style.display = "none";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function openMediaInNewTab(displayUrl: string): void {
  if (!canUseMediaViewerDisplayUrl(displayUrl)) return;

  if (displayUrl.startsWith("blob:") || SAFE_MEDIA_DATA_URL_PATTERN.test(displayUrl)) {
    window.open(displayUrl, "_blank", "noopener,noreferrer");
    return;
  }

  guard.url(displayUrl, "media viewer open");
  window.open(displayUrl, "_blank", "noopener,noreferrer");
}

async function fetchBlobFromDisplayUrl(displayUrl: string): Promise<Blob | null> {
  try {
    const response = await fetch(displayUrl);
    if (!response.ok) return null;
    return await response.blob();
  } catch {
    return null;
  }
}

async function fetchPublicMediaBlob(url: string): Promise<Blob | null> {
  if (!isValidUrl(url)) return null;

  const headers = buildAuthHeader();
  const fetchUrl = isProtectedMessageMediaUrl(url) ? buildProtectedUploadFetchUrl(url) : url;
  try {
    const response = await fetch(
      fetchUrl,
      isProtectedMessageMediaUrl(url)
        ? resolveProtectedUploadFetchOptions(fetchUrl, headers)
        : { credentials: "include" },
    );
    if (!response.ok) return null;
    return await response.blob();
  } catch {
    return null;
  }
}

async function fetchMediaItemBlob(item: MediaItem, displayUrl?: string): Promise<Blob | null> {
  if (displayUrl != null && canUseMediaViewerDisplayUrl(displayUrl)) {
    const blob = await fetchBlobFromDisplayUrl(displayUrl);
    if (blob != null) {
      return blob;
    }
  }

  const sourceUrl = item.url.trim();
  if (sourceUrl === "") return null;

  if (isProtectedMessageMediaUrl(sourceUrl)) {
    return await fetchProtectedUploadBlob(sourceUrl, buildAuthHeader());
  }

  return await fetchPublicMediaBlob(sourceUrl);
}

export async function downloadMediaItem(item: MediaItem, displayUrl?: string): Promise<boolean> {
  const fileName = deriveMediaFileName(item);

  const blob = await fetchMediaItemBlob(item, displayUrl);
  if (blob == null) return false;
  triggerBrowserDownload(blob, fileName);
  return true;
}
