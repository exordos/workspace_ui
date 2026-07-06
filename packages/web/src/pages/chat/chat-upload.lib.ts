import type { WorkspaceFileMetadata } from "~/shared/api/messenger-files.api";
import { detectImageMime, sanitizeFilename, validateFileUpload } from "~/shared/lib/validation";

export interface UploadFileRequestOptions {
  signal?: AbortSignal;
}

export type UploadFileFn = (file: File, options?: UploadFileRequestOptions) => Promise<string>;
export type UploadWorkspaceComposerFileFn = (
  file: File,
  options?: UploadFileRequestOptions,
) => Promise<Pick<WorkspaceFileMetadata, "uuid" | "content_type">>;
export interface ComposerUploadProgressState {
  completed: number;
  total: number;
  activeFileName: string | null;
}

export interface UploadComposerFilesOptions {
  onProgress?: (state: ComposerUploadProgressState) => void;
  signal?: AbortSignal;
}

const MAGIC_BYTE_VALIDATED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

function normalizeImageMime(mime: string): string {
  const normalized = mime.trim().toLowerCase();
  return normalized === "image/jpg" ? "image/jpeg" : normalized;
}

function createAbortError(): Error {
  if (typeof DOMException !== "undefined") {
    return new DOMException("Aborted", "AbortError");
  }
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function safeComposerFileName(file: File): string {
  return sanitizeFilename(file.name) || "file";
}

function escapeMarkdownLinkLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\]/g, "\\]");
}

function resolveWorkspaceFileContentType(
  file: File,
  uploadedFile: Pick<WorkspaceFileMetadata, "content_type">,
): string {
  const uploadedContentType = uploadedFile.content_type.trim();
  if (uploadedContentType.length > 0) return uploadedContentType;

  const localContentType = file.type.trim();
  return localContentType.length > 0 ? localContentType : "application/octet-stream";
}

export function buildWorkspaceFileMarkdownLink(
  file: File,
  uploadedFile: Pick<WorkspaceFileMetadata, "uuid" | "content_type">,
): string {
  const safeName = escapeMarkdownLinkLabel(safeComposerFileName(file));
  const contentType = resolveWorkspaceFileContentType(file, uploadedFile);
  const href = `workspace-file://${uploadedFile.uuid}?content_type=${encodeURIComponent(contentType)}`;

  return contentType.startsWith("image/") ? `![${safeName}](${href})` : `[${safeName}](${href})`;
}

export function appendComposerMarkdownLinks(content: string, links: readonly string[]): string {
  const cleanContent = content.trim();
  if (links.length === 0) return cleanContent;
  if (cleanContent.length === 0) return links.join("\n");
  return `${cleanContent}\n${links.join("\n")}`;
}

async function validateComposerFile(file: File): Promise<void> {
  const validation = validateFileUpload(file);
  if (!validation.valid) {
    throw new Error(validation.error ?? "File validation failed");
  }

  if (file.type.startsWith("image/")) {
    const expectedMime = normalizeImageMime(file.type);
    if (!MAGIC_BYTE_VALIDATED_IMAGE_TYPES.has(expectedMime)) {
      return;
    }
    const mime = detectImageMime(await file.arrayBuffer());
    if (mime == null || normalizeImageMime(mime) !== expectedMime) {
      throw new Error("Image file type is invalid");
    }
  }
}

export async function uploadComposerFiles(
  files: File[],
  uploadFile: UploadFileFn,
  options: UploadComposerFilesOptions = {},
): Promise<string[]> {
  throwIfAborted(options.signal);
  for (const file of files) {
    await validateComposerFile(file);
  }

  if (files.length === 0) {
    return [];
  }

  const links: string[] = [];
  options.onProgress?.({
    completed: 0,
    total: files.length,
    activeFileName: files[0]?.name ?? null,
  });

  for (let i = 0; i < files.length; i += 1) {
    throwIfAborted(options.signal);
    const file = files[i]!;
    const uri =
      options.signal != null
        ? await uploadFile(file, { signal: options.signal })
        : await uploadFile(file);
    const safeName = safeComposerFileName(file);
    links.push(`[${safeName}](${uri})`);

    const nextFileName = i + 1 < files.length ? files[i + 1]!.name : null;
    options.onProgress?.({
      completed: i + 1,
      total: files.length,
      activeFileName: nextFileName,
    });
  }

  return links;
}

export async function uploadWorkspaceComposerFiles(
  files: File[],
  uploadFile: UploadWorkspaceComposerFileFn,
  options: UploadComposerFilesOptions = {},
): Promise<string[]> {
  throwIfAborted(options.signal);
  for (const file of files) {
    await validateComposerFile(file);
  }

  if (files.length === 0) {
    return [];
  }

  const links: string[] = [];
  options.onProgress?.({
    completed: 0,
    total: files.length,
    activeFileName: files[0]?.name ?? null,
  });

  for (let i = 0; i < files.length; i += 1) {
    throwIfAborted(options.signal);
    const file = files[i]!;
    const uploadedFile =
      options.signal != null
        ? await uploadFile(file, { signal: options.signal })
        : await uploadFile(file);
    links.push(buildWorkspaceFileMarkdownLink(file, uploadedFile));

    const nextFileName = i + 1 < files.length ? files[i + 1]!.name : null;
    options.onProgress?.({
      completed: i + 1,
      total: files.length,
      activeFileName: nextFileName,
    });
  }

  return links;
}
