/**
 * CalDAV entity-tag normalization for If-Match headers and API responses.
 */

/** Strip outer quotes for stable client-side storage. */
export function normalizeStoredEtag(etag: string | null | undefined): string | null {
  if (etag == null) return null;
  const trimmed = etag.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.startsWith('W/"') && trimmed.endsWith('"')) {
    return trimmed.slice(3, -1);
  }
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/** Format entity-tag for CalDAV If-Match (quoted string form). */
export function formatEtagForIfMatch(etag: string): string {
  const trimmed = etag.trim();
  if (trimmed.startsWith('W/"') || trimmed.startsWith('"')) {
    return trimmed;
  }
  return `"${trimmed}"`;
}
