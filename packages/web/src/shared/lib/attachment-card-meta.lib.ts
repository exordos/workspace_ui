export type AttachmentMediaKind = "image" | "video" | null;

const IMAGE_EXTENSIONS = new Set([
  "avif",
  "bmp",
  "gif",
  "heic",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "webp",
]);
const VIDEO_EXTENSIONS = new Set(["avi", "m4v", "mov", "mp4", "mpeg", "mpg", "webm"]);
const FORMAT_BY_CONTENT_TYPE: Readonly<Record<string, string>> = {
  "application/pdf": "PDF",
  "application/zip": "ZIP",
  "application/x-zip-compressed": "ZIP",
  "application/vnd.rar": "RAR",
  "application/x-rar-compressed": "RAR",
  "application/x-7z-compressed": "7Z",
  "application/gzip": "GZ",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/vnd.ms-excel": "XLS",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "application/vnd.ms-powerpoint": "PPT",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PPTX",
  "text/plain": "TXT",
  "text/csv": "CSV",
};

function normalizeContentType(contentType?: string): string {
  return contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
}

function getFileExtension(fileName: string): string {
  const name = fileName.trim();
  const lastDot = name.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === name.length - 1) return "";
  const extension = name
    .slice(lastDot + 1)
    .trim()
    .toLowerCase();
  return /^[a-z0-9]{1,16}$/.test(extension) ? extension : "";
}

export function resolveAttachmentMediaKind(
  fileName: string,
  contentType?: string,
): AttachmentMediaKind {
  const normalizedType = normalizeContentType(contentType);
  if (normalizedType.startsWith("image/")) return "image";
  if (normalizedType.startsWith("video/")) return "video";
  if (normalizedType !== "" && normalizedType !== "application/octet-stream") return null;

  const extension = getFileExtension(fileName);
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  return null;
}

export function getAttachmentExtensionLabel(fileName: string, contentType?: string): string {
  const extension = getFileExtension(fileName);
  if (extension.length > 0) return extension.toUpperCase().slice(0, 4);
  return FORMAT_BY_CONTENT_TYPE[normalizeContentType(contentType)] ?? "FILE";
}

export function formatAttachmentSize(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return "0 B";
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${Math.round(sizeBytes / 1024)} KB`;
  if (sizeBytes < 1024 * 1024 * 1024) {
    return `${Math.round((sizeBytes / (1024 * 1024)) * 10) / 10} MB`;
  }
  return `${Math.round((sizeBytes / (1024 * 1024 * 1024)) * 10) / 10} GB`;
}

export function getAttachmentCardMetadata(
  fileName: string,
  contentType?: string,
  sizeBytes?: number,
): { formatLabel: string; sizeLabel?: string; iconName: "files" | "images" | "videos" } {
  const mediaKind = resolveAttachmentMediaKind(fileName, contentType);
  let iconName: "files" | "images" | "videos" = "files";
  if (mediaKind === "image") iconName = "images";
  if (mediaKind === "video") iconName = "videos";
  return {
    formatLabel: getAttachmentExtensionLabel(fileName, contentType),
    ...(sizeBytes == null || !Number.isFinite(sizeBytes) || sizeBytes < 0
      ? {}
      : { sizeLabel: formatAttachmentSize(sizeBytes) }),
    iconName,
  };
}
