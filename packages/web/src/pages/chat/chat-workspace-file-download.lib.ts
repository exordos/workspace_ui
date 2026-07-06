import { sanitizeFilename } from "~/shared/lib/validation";

export const WORKSPACE_FILE_DOWNLOAD_KEY_PREFIX = "workspace-file:";

export interface WorkspaceDownloadFileNameInput {
  fileUuid: string;
  fileNameHint?: string | null;
  contentDisposition?: string | null;
}

function safeDecodeUriComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function filenameFromContentDisposition(contentDisposition: string | null | undefined): string {
  const header = contentDisposition?.trim() ?? "";
  if (header.length === 0) {
    return "";
  }

  const encodedMatch = /(?:^|;)\s*filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (encodedMatch?.[1] != null) {
    return safeDecodeUriComponent(encodedMatch[1].trim().replace(/^"|"$/g, ""));
  }

  const quotedMatch = /(?:^|;)\s*filename\s*=\s*"([^"]+)"/i.exec(header);
  if (quotedMatch?.[1] != null) {
    return quotedMatch[1].trim();
  }

  const plainMatch = /(?:^|;)\s*filename\s*=\s*([^;]+)/i.exec(header);
  return plainMatch?.[1]?.trim().replace(/^"|"$/g, "") ?? "";
}

export function workspaceFileDownloadKey(fileUuid: string): string {
  return `${WORKSPACE_FILE_DOWNLOAD_KEY_PREFIX}${fileUuid.trim()}`;
}

export function deriveWorkspaceDownloadFileName(input: WorkspaceDownloadFileNameInput): string {
  const fromHeader = sanitizeFilename(filenameFromContentDisposition(input.contentDisposition));
  if (fromHeader.length > 0) {
    return fromHeader;
  }

  const fromHint = sanitizeFilename(input.fileNameHint?.trim() ?? "");
  if (fromHint.length > 0) {
    return fromHint;
  }

  const fromUuid = sanitizeFilename(input.fileUuid.trim());
  return fromUuid.length > 0 ? fromUuid : "workspace-file";
}

export function parseWorkspaceDownloadTotalBytes(
  rawValue: string | null | undefined,
): number | null {
  if (rawValue == null) {
    return null;
  }
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.trunc(parsed);
}

export function triggerWorkspaceBrowserDownload(blob: Blob, fileName: string): void {
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
    // Blob URL живет только на время synthetic click. Не держим его в DOM или
    // store, чтобы повторные скачивания больших Workspace files не копили память.
    URL.revokeObjectURL(objectUrl);
  }
}
