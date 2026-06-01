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

export function deriveMediaFileName(item: MediaItem): string {
  const fromAlt = sanitizeFilename((item.alt ?? "").trim());
  if (fromAlt) return fromAlt;

  const fromUrl = sanitizeFilename(fileNameFromUrl(item.url));
  if (fromUrl) return fromUrl;

  return item.type === "video" ? "media.mp4" : "image";
}

export function canUseMediaViewerDisplayUrl(displayUrl: string | undefined): boolean {
  if (displayUrl == null || displayUrl.trim() === "") return false;
  if (displayUrl === AUTH_IMAGE_PLACEHOLDER_SRC) return false;
  return displayUrl.startsWith("blob:") || isValidUrl(displayUrl);
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

  if (displayUrl.startsWith("blob:")) {
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

export async function downloadMediaItem(item: MediaItem, displayUrl?: string): Promise<boolean> {
  const fileName = deriveMediaFileName(item);

  if (displayUrl != null && displayUrl.startsWith("blob:")) {
    const blob = await fetchBlobFromDisplayUrl(displayUrl);
    if (blob == null) return false;
    triggerBrowserDownload(blob, fileName);
    return true;
  }

  const sourceUrl = item.url.trim();
  if (sourceUrl === "") return false;

  if (isProtectedMessageMediaUrl(sourceUrl)) {
    const blob = await fetchProtectedUploadBlob(sourceUrl, buildAuthHeader());
    if (blob == null) return false;
    triggerBrowserDownload(blob, fileName);
    return true;
  }

  if (canUseMediaViewerDisplayUrl(displayUrl)) {
    const blob = await fetchBlobFromDisplayUrl(displayUrl!);
    if (blob != null) {
      triggerBrowserDownload(blob, fileName);
      return true;
    }
  }

  const blob = await fetchPublicMediaBlob(sourceUrl);
  if (blob == null) return false;
  triggerBrowserDownload(blob, fileName);
  return true;
}
