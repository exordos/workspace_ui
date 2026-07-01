const IMAGE_FILE_NAME_EXT = /\.(apng|avif|bmp|gif|jpe?g|png|svg|webp)(?:$|[?#])/i;

function safeDecodeUriComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function isImageFileName(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  const pathOnly = trimmed.split("?")[0]?.split("#")[0] ?? "";
  const lastSegment = pathOnly.split("/").at(-1) ?? pathOnly;
  return IMAGE_FILE_NAME_EXT.test(safeDecodeUriComponent(lastSegment));
}
