import { detectImageMime, sanitizeFilename, validateFileUpload } from "~/shared/lib/validation";

export interface UploadFileRequestOptions {
  signal?: AbortSignal;
  streamUuid?: string;
}

export type UploadFileFn = (file: File, options?: UploadFileRequestOptions) => Promise<string>;
export interface ComposerUploadProgressState {
  completed: number;
  total: number;
  activeFileName: string | null;
}

export interface UploadComposerFilesOptions {
  onProgress?: (state: ComposerUploadProgressState) => void;
  signal?: AbortSignal;
  streamUuid?: string;
}

const MAGIC_BYTE_VALIDATED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

const INLINE_MEDIA_URN_RE = /^urn:(?:image|video):/i;

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
    const requestOptions: UploadFileRequestOptions = {};
    if (options.signal != null) {
      requestOptions.signal = options.signal;
    }
    if (options.streamUuid != null) {
      requestOptions.streamUuid = options.streamUuid;
    }
    const hasRequestOptions = requestOptions.signal != null || requestOptions.streamUuid != null;
    const uri = hasRequestOptions ? await uploadFile(file, requestOptions) : await uploadFile(file);
    const safeName = sanitizeFilename(file.name) || "file";
    const mediaPrefix = INLINE_MEDIA_URN_RE.test(uri) ? "!" : "";
    links.push(`${mediaPrefix}[${safeName}](${uri})`);

    const nextFileName = i + 1 < files.length ? files[i + 1]!.name : null;
    options.onProgress?.({
      completed: i + 1,
      total: files.length,
      activeFileName: nextFileName,
    });
  }

  return links;
}
