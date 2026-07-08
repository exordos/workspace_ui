/**
 * Normalizes Workspace file preview blobs before createObjectURL.
 *
 * The download endpoint can return application/octet-stream, which prevents
 * img elements from decoding blob URLs. Use the URN/markdown content type.
 */
const GENERIC_BINARY_MIME_TYPES = new Set(["", "application/octet-stream", "binary/octet-stream"]);

function resolveWorkspacePreviewContentType(contentType: string | undefined): string | null {
  const trimmed = contentType?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

/** Returns a blob with the correct MIME for inline image previews. */
export function normalizeWorkspacePreviewBlob(blob: Blob, contentType?: string): Blob {
  const fallbackType = resolveWorkspacePreviewContentType(contentType);
  const blobType = blob.type.trim();

  if (fallbackType == null || !GENERIC_BINARY_MIME_TYPES.has(blobType)) {
    return blob;
  }

  return new Blob([blob], { type: fallbackType });
}
