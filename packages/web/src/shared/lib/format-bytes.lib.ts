/**
 * Human-readable byte formatting for diagnostics and download UI.
 */

function resolveBytePrecision(unitIndex: number, value: number): number {
  if (unitIndex === 0) {
    return 0;
  }
  if (value >= 10) {
    return 1;
  }
  return 2;
}

/** Formats a byte count as B / KB / MB / GB. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = resolveBytePrecision(unitIndex, value);
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

/** Converts kilobytes to bytes and formats. */
export function formatKilobytes(kilobytes: number): string {
  return formatBytes(kilobytes * 1024);
}
