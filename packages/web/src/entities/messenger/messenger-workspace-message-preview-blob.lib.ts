import { createHeicPreview, isHeicAttachment } from "~/shared/lib/heic-preview.lib";
import type { WorkspaceMessageFileReference } from "~/shared/lib/workspace-message-render/workspace-message-document.types";

/**
 * Normalizes Workspace file preview blobs before createObjectURL.
 *
 * The download endpoint can return application/octet-stream, which prevents
 * img elements from decoding blob URLs. Use the URN/markdown content type.
 */
const GENERIC_BINARY_MIME_TYPES = new Set(["", "application/octet-stream", "binary/octet-stream"]);
// Follow the lifetime of the original blob held by the scoped resource cache.
const heicPreviewByOriginal = new WeakMap<Blob, Blob>();

function hasConcreteContentType(contentType = ""): boolean {
  const mimeType = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return !GENERIC_BINARY_MIME_TYPES.has(mimeType);
}

/** Returns a blob with the correct MIME for inline image previews. */
export function normalizeWorkspacePreviewBlob(blob: Blob, contentType?: string): Blob {
  if (
    !hasConcreteContentType(contentType) ||
    isHeicAttachment(undefined, contentType) ||
    hasConcreteContentType(blob.type)
  ) {
    return blob;
  }

  return new Blob([blob], { type: contentType?.trim() });
}

export function isWorkspaceHeicMedia(
  reference: Pick<WorkspaceMessageFileReference, "name" | "contentType" | "mediaKind">,
  responseContentType?: string,
): boolean {
  if (reference.mediaKind !== "image") return false;
  if (hasConcreteContentType(responseContentType)) {
    return isHeicAttachment(undefined, responseContentType);
  }
  return isHeicAttachment(reference.name, reference.contentType);
}

/** Prepares media for display while leaving the authorized original available for download. */
export async function buildWorkspaceMediaDisplayBlob(
  blob: Blob,
  reference: Pick<WorkspaceMessageFileReference, "name" | "contentType" | "mediaKind">,
  signal: AbortSignal,
): Promise<Blob> {
  signal.throwIfAborted();
  if (!isWorkspaceHeicMedia(reference, blob.type)) {
    return normalizeWorkspacePreviewBlob(blob, reference.contentType);
  }

  const cached = heicPreviewByOriginal.get(blob);
  if (cached != null) return cached;

  const preview = await createHeicPreview(blob, { signal });
  signal.throwIfAborted();
  heicPreviewByOriginal.set(blob, preview);
  return preview;
}
