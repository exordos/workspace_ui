const AUTH_IMAGE_PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160" viewBox="0 0 240 160" aria-hidden="true">
  <rect x="78" y="48" width="84" height="44" rx="5" fill="none" stroke="#8b8b93" stroke-opacity="0.4" stroke-width="1.25"/>
  <circle cx="96" cy="60" r="5" fill="#8b8b93" fill-opacity="0.4"/>
  <path d="M84 84 L108 68 L126 80 L144 64 L156 84 Z" fill="#8b8b93" fill-opacity="0.26"/>
  <line x1="72" y1="112" x2="168" y2="112" stroke="#8b8b93" stroke-opacity="0.28" stroke-width="2" stroke-linecap="round"/>
</svg>`;

export const AUTH_IMAGE_PLACEHOLDER_SRC = `data:image/svg+xml,${encodeURIComponent(AUTH_IMAGE_PLACEHOLDER_SVG)}`;

export function isAuthMediaPlaceholderAttr(value: string | null): boolean {
  if (value == null || value === "") return true;
  return value === AUTH_IMAGE_PLACEHOLDER_SRC;
}

const FILE_PROTOCOL_BLOB_AS_DATA_URL_MAX_BYTES = 15 * 1024 * 1024;

export async function createDisplayableBlobUrl(
  blob: Blob,
  revokeRegistry: string[],
): Promise<string> {
  const preferDataUrl =
    typeof window !== "undefined" &&
    window.location.protocol === "file:" &&
    blob.size <= FILE_PROTOCOL_BLOB_AS_DATA_URL_MAX_BYTES;

  if (!preferDataUrl) {
    const url = URL.createObjectURL(blob);
    revokeRegistry.push(url);
    return url;
  }

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result === "string") {
        resolve(result);
        return;
      }
      reject(reader.error ?? new Error("FileReader: expected data URL string"));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("FileReader failed"));
    };
    reader.readAsDataURL(blob);
  });
}
