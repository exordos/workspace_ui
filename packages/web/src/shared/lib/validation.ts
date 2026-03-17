/**
 * Input validation utilities.
 *
 * All validation functions are pure and side-effect free.
 * Use before processing user input in API calls, URL navigation, file uploads.
 */

const SAFE_PROTOCOLS = new Set(["https:", "http:"]);

function hasValidHostnameLabels(hostname: string): boolean {
  if (hostname.length === 0) {
    return false;
  }
  if (hostname.startsWith(".") || hostname.endsWith(".")) {
    return false;
  }
  return !hostname.includes("..");
}

export function isValidUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return SAFE_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}

export function isValidRealmUrl(input: string): boolean {
  if (!isValidUrl(input)) return false;
  try {
    const url = new URL(input);
    return (
      url.protocol === "https:" &&
      !url.hostname.includes(" ") &&
      hasValidHostnameLabels(url.hostname)
    );
  } catch {
    return false;
  }
}

export function isValidEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim());
}

const IMAGE_MAGIC_BYTES: { bytes: number[]; mime: string }[] = [
  { bytes: [0x89, 0x50, 0x4e, 0x47], mime: "image/png" },
  { bytes: [0xff, 0xd8, 0xff], mime: "image/jpeg" },
  { bytes: [0x47, 0x49, 0x46, 0x38], mime: "image/gif" },
  { bytes: [0x52, 0x49, 0x46, 0x46], mime: "image/webp" },
];

export function detectImageMime(buffer: ArrayBuffer): string | null {
  const view = new Uint8Array(buffer.slice(0, 12));
  for (const { bytes, mime } of IMAGE_MAGIC_BYTES) {
    if (bytes.every((b, i) => view[i] === b)) {
      if (mime === "image/webp" && view[8] !== 0x57) continue;
      return mime;
    }
  }
  return null;
}

const MAX_FILE_SIZE_MB = 25;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export function validateFileUpload(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { valid: false, error: `File is too large (max ${MAX_FILE_SIZE_MB} MB)` };
  }
  if (file.size === 0) {
    return { valid: false, error: "File is empty" };
  }
  return { valid: true };
}

export function sanitizeFilename(name: string): string {
  return (
    name
      // eslint-disable-next-line no-control-regex
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
      .replace(/\.{2,}/g, ".")
      .trim()
  );
}

export function isStrongPassword(password: string): boolean {
  return password.length >= 8;
}
