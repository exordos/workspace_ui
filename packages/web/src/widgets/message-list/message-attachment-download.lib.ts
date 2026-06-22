import {
  buildProtectedUploadFetchUrl,
  resolveProtectedUploadFetchOptions,
} from "~/shared/lib/protected-message-media";
import { extractUserUploadsPathAndQuery } from "~/shared/lib/user-uploads-url.lib";
import { sanitizeFilename } from "~/shared/lib/validation";

const USER_UPLOADS_SEGMENT = "/user_uploads/";

function safeDecodeUriComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function extractUserUploadPath(rawHref: string): string | null {
  const href = rawHref.trim();
  if (!href) return null;
  const normalizedPath = extractUserUploadsPathAndQuery(href);
  return normalizedPath?.startsWith(USER_UPLOADS_SEGMENT) ? normalizedPath : null;
}

export function deriveAttachmentFileName(rawLabel: string, path: string): string {
  const label = sanitizeFilename(rawLabel.trim());
  if (label) return label;

  const fallback = path.split("/").at(-1)?.trim() ?? "";
  const decodedFallback = fallback ? safeDecodeUriComponent(fallback) : "attachment";
  const sanitizedFallback = sanitizeFilename(decodedFallback);
  return sanitizedFallback || "attachment";
}

function triggerBrowserDownload(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.click();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

interface DownloadUserUploadAttachmentOptions {
  path: string;
  fileName: string;
  authHeaders: Record<string, string>;
  credentials?: RequestCredentials;
  onProgress?: (progress: DownloadAttachmentProgress) => void;
  fetchImpl?: typeof fetch;
}

export interface DownloadAttachmentProgress {
  receivedBytes: number;
  totalBytes: number | null;
}

function parseTotalBytes(raw: string | null): number | null {
  if (raw == null) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
}

async function readResponseBlob(
  response: Response,
  onProgress?: (progress: DownloadAttachmentProgress) => void,
): Promise<Blob> {
  const totalBytes = parseTotalBytes(response.headers.get("content-length"));
  if (response.body == null) {
    const blob = await response.blob();
    onProgress?.({
      receivedBytes: blob.size,
      totalBytes: totalBytes ?? blob.size,
    });
    return blob;
  }

  const reader = response.body.getReader();
  const chunks: ArrayBuffer[] = [];
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value == null) continue;
    const chunk = new Uint8Array(value.byteLength);
    chunk.set(value);
    chunks.push(chunk.buffer);
    receivedBytes += value.byteLength;
    onProgress?.({ receivedBytes, totalBytes });
  }

  return new Blob(chunks, {
    type: response.headers.get("content-type") ?? "application/octet-stream",
  });
}

export async function downloadUserUploadAttachment(
  options: DownloadUserUploadAttachmentOptions,
): Promise<boolean> {
  const { path, fileName, authHeaders, onProgress, fetchImpl = fetch } = options;
  const normalizedPath = extractUserUploadPath(path);
  if (!normalizedPath?.startsWith(USER_UPLOADS_SEGMENT)) {
    return false;
  }

  const fetchUrl = buildProtectedUploadFetchUrl(normalizedPath);
  const response = await fetchImpl(
    fetchUrl,
    resolveProtectedUploadFetchOptions(fetchUrl, authHeaders),
  );
  if (!response.ok) return false;

  const blob = await readResponseBlob(response, onProgress);
  triggerBrowserDownload(blob, deriveAttachmentFileName(fileName, normalizedPath));
  return true;
}
