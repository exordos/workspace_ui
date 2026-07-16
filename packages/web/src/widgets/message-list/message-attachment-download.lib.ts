import { appendDevWorkspaceApiProxyHeaders } from "~/shared/api/client";
import { MESSENGER_WORKSPACE_API_PATH } from "~/shared/config/workspace-api-layout";
import { sanitizeFilename } from "~/shared/lib/validation";
import {
  fetchWorkspaceFileBlobFromApi,
  resolveCurrentWorkspaceFileCacheScope,
} from "~/shared/lib/workspace-file-blob-cache";

const WORKSPACE_FILE_DOWNLOAD_PREFIX = `${MESSENGER_WORKSPACE_API_PATH}/files/`;
const WORKSPACE_FILE_DOWNLOAD_SUFFIX = "/actions/download";

function safeParseUrl(value: string): URL | null {
  try {
    return new URL(value, window.location.origin);
  } catch {
    return null;
  }
}

function isRelativeOrSameOrigin(rawHref: string, parsed: URL): boolean {
  return rawHref.startsWith("/") || parsed.origin === window.location.origin;
}

function isWorkspaceFileDownloadPath(pathname: string): boolean {
  return (
    pathname.startsWith(WORKSPACE_FILE_DOWNLOAD_PREFIX) &&
    pathname.endsWith(WORKSPACE_FILE_DOWNLOAD_SUFFIX) &&
    pathname.length > WORKSPACE_FILE_DOWNLOAD_PREFIX.length + WORKSPACE_FILE_DOWNLOAD_SUFFIX.length
  );
}

export function extractWorkspaceFileDownloadPath(rawHref: string): string | null {
  const href = rawHref.trim();
  if (!href) return null;
  const parsed = safeParseUrl(href);
  if (parsed == null || !isRelativeOrSameOrigin(href, parsed)) return null;
  if (!isWorkspaceFileDownloadPath(parsed.pathname)) return null;
  return `${parsed.pathname}${parsed.search}`;
}

export function deriveAttachmentFileName(rawLabel: string): string {
  const label = sanitizeFilename(rawLabel.trim());
  return label || "attachment";
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

interface DownloadWorkspaceFileAttachmentOptions {
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

export async function downloadWorkspaceFileAttachment(
  options: DownloadWorkspaceFileAttachmentOptions,
): Promise<boolean> {
  const {
    path,
    fileName,
    authHeaders,
    credentials = "include",
    onProgress,
    fetchImpl = fetch,
  } = options;
  const normalizedPath = extractWorkspaceFileDownloadPath(path);
  if (normalizedPath == null) {
    return false;
  }

  const cacheScope = resolveCurrentWorkspaceFileCacheScope();
  const blob =
    cacheScope == null
      ? await (async () => {
          const response = await fetchImpl(normalizedPath, {
            headers: appendDevWorkspaceApiProxyHeaders(normalizedPath, authHeaders),
            credentials,
          });
          if (!response.ok) return null;
          return await readResponseBlob(response, onProgress);
        })()
      : await fetchWorkspaceFileBlobFromApi(normalizedPath, {
          headers: authHeaders,
          fetchImpl,
          readBinary: async (response) => await readResponseBlob(response, onProgress),
        });
  if (blob == null) return false;
  triggerBrowserDownload(blob, deriveAttachmentFileName(fileName));
  return true;
}
