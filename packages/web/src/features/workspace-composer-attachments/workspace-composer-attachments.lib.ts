import type { WorkspaceFileMetadata } from "~/shared/api/messenger-files.api";
import { sanitizeFilename } from "~/shared/lib/validation";
import type { WorkspaceComposerAttachmentServerMetadata } from "./workspace-composer-attachments.types";

type WorkspaceComposerAttachmentUrnType = "file" | "image" | "video";

interface MediaDimensions {
  width: number;
  height: number;
}

interface BuildWorkspaceComposerAttachmentMetadataOptions {
  signal?: AbortSignal;
}

const MEDIA_DIMENSIONS_TIMEOUT_MS = 300;

function safeFileName(file: File): string {
  return sanitizeFilename(file.name) || "file";
}

function escapeMarkdownLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\]/g, "\\]");
}

function resolveUrnType(contentType: string): WorkspaceComposerAttachmentUrnType {
  const normalized = contentType.trim().toLowerCase();
  if (normalized.startsWith("image/")) return "image";
  if (normalized.startsWith("video/")) return "video";
  return "file";
}

function canReadObjectUrl(): boolean {
  return typeof URL.createObjectURL === "function" && typeof URL.revokeObjectURL === "function";
}

function toDimensions(width: number, height: number): MediaDimensions | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width: Math.floor(width), height: Math.floor(height) };
}

function createMediaDimensionFinisher(
  cleanup: () => void,
  resolve: (dimensions: MediaDimensions | null) => void,
): (dimensions: MediaDimensions | null) => void {
  let completed = false;
  return (dimensions) => {
    if (completed) return;
    completed = true;
    cleanup();
    resolve(dimensions);
  };
}

function readImageDimensions(file: File, signal?: AbortSignal): Promise<MediaDimensions | null> {
  if (signal?.aborted || typeof Image === "undefined" || !canReadObjectUrl()) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    const cleanup = () => {
      image.onload = null;
      image.onerror = null;
      signal?.removeEventListener("abort", handleAbort);
      globalThis.clearTimeout(timeoutId);
      URL.revokeObjectURL(objectUrl);
    };
    const finish = createMediaDimensionFinisher(cleanup, resolve);
    const handleAbort = () => finish(null);
    const timeoutId = globalThis.setTimeout(() => finish(null), MEDIA_DIMENSIONS_TIMEOUT_MS);

    signal?.addEventListener("abort", handleAbort, { once: true });
    image.onload = () => finish(toDimensions(image.naturalWidth, image.naturalHeight));
    image.onerror = () => finish(null);
    image.src = objectUrl;
  });
}

function readVideoDimensions(file: File, signal?: AbortSignal): Promise<MediaDimensions | null> {
  if (signal?.aborted || typeof document === "undefined" || !canReadObjectUrl()) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);

    const cleanup = () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("error", handleError);
      signal?.removeEventListener("abort", handleAbort);
      globalThis.clearTimeout(timeoutId);
      video.removeAttribute("src");
      URL.revokeObjectURL(objectUrl);
    };
    const finish = createMediaDimensionFinisher(cleanup, resolve);
    const handleLoadedMetadata = () => finish(toDimensions(video.videoWidth, video.videoHeight));
    const handleError = () => finish(null);
    const handleAbort = () => finish(null);
    const timeoutId = globalThis.setTimeout(() => finish(null), MEDIA_DIMENSIONS_TIMEOUT_MS);

    signal?.addEventListener("abort", handleAbort, { once: true });
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("error", handleError);
    video.preload = "metadata";
    video.src = objectUrl;
  });
}

async function readMediaDimensions(
  type: WorkspaceComposerAttachmentUrnType,
  file: File,
  signal?: AbortSignal,
): Promise<MediaDimensions | null> {
  try {
    if (type === "image") return await readImageDimensions(file, signal);
    if (type === "video") return await readVideoDimensions(file, signal);
    return null;
  } catch {
    return null;
  }
}

export async function buildWorkspaceComposerAttachmentMetadata(
  file: File,
  uploaded: Pick<WorkspaceFileMetadata, "uuid" | "content_type">,
  options: BuildWorkspaceComposerAttachmentMetadataOptions = {},
): Promise<WorkspaceComposerAttachmentServerMetadata> {
  const name = safeFileName(file);
  const contentType = uploaded.content_type.trim() || file.type.trim();
  const urnType = resolveUrnType(contentType);
  const dimensions = await readMediaDimensions(urnType, file, options.signal);
  const params = new URLSearchParams({ name });
  if (contentType.length > 0) params.set("content_type", contentType);
  if (dimensions != null) {
    params.set("w", String(dimensions.width));
    params.set("h", String(dimensions.height));
  }
  params.set("size", String(file.size));
  const metadata: WorkspaceComposerAttachmentServerMetadata = {
    uuid: uploaded.uuid,
    markdownLink: (() => {
      const urn = `urn:${urnType}:${uploaded.uuid}?${params.toString()}`;
      const label = escapeMarkdownLabel(name);
      return urnType === "image" ? `![${label}](${urn})` : `[${label}](${urn})`;
    })(),
    contentType: contentType.length > 0 ? contentType : null,
    name,
    sizeBytes: file.size,
  };
  return dimensions == null
    ? metadata
    : { ...metadata, width: dimensions.width, height: dimensions.height };
}

export function buildWorkspaceComposerAttachmentMarkdown(
  metadata: WorkspaceComposerAttachmentServerMetadata,
): string {
  return metadata.markdownLink;
}

export function appendWorkspaceComposerAttachmentMarkdown(
  content: string,
  links: readonly string[],
): string {
  const trimmed = content.trim();
  if (links.length === 0) return trimmed;
  if (trimmed.length === 0) return links.join("\n");
  return `${trimmed}\n${links.join("\n")}`;
}
