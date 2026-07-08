import type { WorkspaceFileMetadata } from "~/shared/api/messenger-files.api";
import { sanitizeFilename } from "~/shared/lib/validation";

export type WorkspaceFileUrnType = "image" | "video" | "file";

export interface WorkspaceFileUrnMetadata {
  type: WorkspaceFileUrnType;
  uuid: string;
  name: string;
  contentType?: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
}

interface BuildWorkspaceFileMetadataOptions {
  signal?: AbortSignal;
}

interface MediaDimensions {
  width: number;
  height: number;
}

const MEDIA_DIMENSIONS_TIMEOUT_MS = 300;

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

function normalizeContentType(
  file: File,
  uploadedFile: Pick<WorkspaceFileMetadata, "content_type">,
): string | undefined {
  const uploadedContentType = uploadedFile.content_type.trim();
  if (uploadedContentType.length > 0) return uploadedContentType;

  const localContentType = file.type.trim();
  return localContentType.length > 0 ? localContentType : undefined;
}

function resolveWorkspaceFileUrnType(contentType: string | undefined): WorkspaceFileUrnType {
  const normalizedContentType = contentType?.trim().toLowerCase() ?? "";
  if (normalizedContentType.startsWith("image/")) {
    return "image";
  }
  if (normalizedContentType.startsWith("video/")) {
    return "video";
  }
  return "file";
}

function canReadObjectUrl(): boolean {
  return typeof URL.createObjectURL === "function" && typeof URL.revokeObjectURL === "function";
}

function toDimensions(width: number, height: number): MediaDimensions | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return {
    width: Math.floor(width),
    height: Math.floor(height),
  };
}

function readImageDimensions(file: File, signal?: AbortSignal): Promise<MediaDimensions | null> {
  if (typeof Image === "undefined" || !canReadObjectUrl()) {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    throwIfAborted(signal);

    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    let completed = false;

    const cleanup = () => {
      image.onload = null;
      image.onerror = null;
      signal?.removeEventListener("abort", handleAbort);
      window.clearTimeout(timeoutId);
      URL.revokeObjectURL(objectUrl);
    };

    const finish = (dimensions: MediaDimensions | null) => {
      if (completed) return;
      completed = true;
      cleanup();
      resolve(dimensions);
    };

    const fail = (error: Error) => {
      if (completed) return;
      completed = true;
      cleanup();
      reject(error);
    };

    const handleAbort = () => {
      fail(createAbortError());
    };

    const timeoutId = window.setTimeout(() => {
      finish(null);
    }, MEDIA_DIMENSIONS_TIMEOUT_MS);

    signal?.addEventListener("abort", handleAbort, { once: true });
    image.onload = () => {
      finish(toDimensions(image.naturalWidth, image.naturalHeight));
    };
    image.onerror = () => {
      finish(null);
    };
    image.src = objectUrl;
  });
}

function readVideoDimensions(file: File, signal?: AbortSignal): Promise<MediaDimensions | null> {
  if (typeof document === "undefined" || !canReadObjectUrl()) {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    throwIfAborted(signal);

    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    let completed = false;

    const cleanup = () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("error", handleError);
      signal?.removeEventListener("abort", handleAbort);
      window.clearTimeout(timeoutId);
      video.removeAttribute("src");
      URL.revokeObjectURL(objectUrl);
    };

    const finish = (dimensions: MediaDimensions | null) => {
      if (completed) return;
      completed = true;
      cleanup();
      resolve(dimensions);
    };

    const fail = (error: Error) => {
      if (completed) return;
      completed = true;
      cleanup();
      reject(error);
    };

    const handleLoadedMetadata = () => {
      finish(toDimensions(video.videoWidth, video.videoHeight));
    };

    const handleError = () => {
      finish(null);
    };

    const handleAbort = () => {
      fail(createAbortError());
    };

    const timeoutId = window.setTimeout(() => {
      finish(null);
    }, MEDIA_DIMENSIONS_TIMEOUT_MS);

    signal?.addEventListener("abort", handleAbort, { once: true });
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("error", handleError);
    video.preload = "metadata";
    video.src = objectUrl;
  });
}

async function readMediaDimensions(
  type: WorkspaceFileUrnType,
  file: File,
  signal?: AbortSignal,
): Promise<MediaDimensions | null> {
  try {
    if (type === "image") {
      return await readImageDimensions(file, signal);
    }
    if (type === "video") {
      return await readVideoDimensions(file, signal);
    }
    return null;
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }
    return null;
  }
}

export async function buildWorkspaceFileMetadata(
  file: File,
  uploadedFile: Pick<WorkspaceFileMetadata, "uuid" | "content_type">,
  options: BuildWorkspaceFileMetadataOptions = {},
): Promise<WorkspaceFileUrnMetadata> {
  throwIfAborted(options.signal);

  const contentType = normalizeContentType(file, uploadedFile);
  const type = resolveWorkspaceFileUrnType(contentType);
  const dimensions = await readMediaDimensions(type, file, options.signal);

  throwIfAborted(options.signal);

  return {
    type,
    uuid: uploadedFile.uuid,
    name: safeComposerFileName(file),
    ...(contentType == null ? {} : { contentType }),
    ...(dimensions == null ? {} : { width: dimensions.width, height: dimensions.height }),
    ...(Number.isFinite(file.size) && file.size > 0 ? { sizeBytes: file.size } : {}),
  };
}

export function buildWorkspaceFileUrnMarkdownLink(metadata: WorkspaceFileUrnMetadata): string {
  const params = new URLSearchParams();
  params.set("name", metadata.name);
  if (metadata.contentType != null) {
    params.set("content_type", metadata.contentType);
  }
  if (metadata.width != null) {
    params.set("w", String(metadata.width));
  }
  if (metadata.height != null) {
    params.set("h", String(metadata.height));
  }
  if (metadata.sizeBytes != null) {
    params.set("size", String(metadata.sizeBytes));
  }

  const query = params.toString();
  const href = `urn:${metadata.type}:${metadata.uuid}${query.length > 0 ? `?${query}` : ""}`;
  const safeName = escapeMarkdownLinkLabel(metadata.name);

  return metadata.type === "image" ? `![${safeName}](${href})` : `[${safeName}](${href})`;
}
