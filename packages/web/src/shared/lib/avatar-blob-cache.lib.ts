/**
 * Pure policy helpers for persisting avatar image blobs in IndexedDB.
 *
 * Cache keys strip the `_av` busting query param so bumpAvatarVersion does not
 * duplicate rows. Eviction is LRU by lastAccessedAt per Zulip instance.
 *
 * Usage:
 *   import { buildAvatarBlobCacheKey, pickAvatarBlobEvictionIds } from "~/shared/lib/avatar-blob-cache.lib";
 */

export const AVATAR_BLOB_CACHE_MAX_TOTAL_BYTES = 25 * 1024 * 1024;
export const AVATAR_BLOB_CACHE_MAX_ENTRY_BYTES = 512 * 1024;
export const AVATAR_BLOB_CACHE_MAX_ENTRIES = 800;

/** Aggressive eviction target when IndexedDB quota is exceeded (50% of normal cap). */
export const AVATAR_BLOB_CACHE_QUOTA_RETRY_TOTAL_BYTES = Math.floor(
  AVATAR_BLOB_CACHE_MAX_TOTAL_BYTES * 0.5,
);

export interface AvatarBlobCacheEvictionRow {
  id: string;
  byteSize: number;
  lastAccessedAt: number;
}

export interface AvatarBlobCacheTotals {
  totalBytes: number;
  entryCount: number;
}

const AVATAR_VERSION_QUERY = "_av";

/** Returns true when the resolved src should bypass IndexedDB (preview URLs). */
export function shouldBypassAvatarBlobCache(resolvedSrc: string | undefined | null): boolean {
  if (resolvedSrc == null) return true;
  const s = resolvedSrc.trim();
  if (s.length === 0) return true;
  return s.startsWith("blob:") || s.startsWith("data:");
}

/**
 * Stable cache key for an avatar URL (relative path or absolute), without `_av`.
 */
export function buildAvatarBlobCacheKey(resolvedOrRelativeUrl: string): string | null {
  const trimmed = resolvedOrRelativeUrl.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.startsWith("blob:") || trimmed.startsWith("data:")) return null;

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const parsed = new URL(trimmed);
      parsed.searchParams.delete(AVATAR_VERSION_QUERY);
      const search = parsed.search;
      return `${parsed.pathname}${search}`;
    } catch {
      return null;
    }
  }

  const q = trimmed.indexOf("?");
  const hash = trimmed.indexOf("#");
  let cut = trimmed.length;
  if (q >= 0) cut = Math.min(cut, q);
  if (hash >= 0) cut = Math.min(cut, hash);
  const pathPart = trimmed.slice(0, cut);
  const tail = trimmed.slice(cut);
  if (tail.length === 0) return pathPart.length > 0 ? pathPart : null;

  try {
    const params = new URLSearchParams(tail.startsWith("?") ? tail.slice(1) : tail);
    params.delete(AVATAR_VERSION_QUERY);
    const nextSearch = params.toString();
    return nextSearch.length > 0 ? `${pathPart}?${nextSearch}` : pathPart;
  } catch {
    return pathPart.length > 0 ? pathPart : null;
  }
}

export function avatarBlobCacheRowId(instanceId: string, cacheKey: string): string {
  return `${instanceId}:${cacheKey}`;
}

export function isAvatarBlobCacheEntrySizeAllowed(byteSize: number): boolean {
  return byteSize > 0 && byteSize <= AVATAR_BLOB_CACHE_MAX_ENTRY_BYTES;
}

export function isAvatarBlobCacheVersionValid(
  rowVersion: number,
  currentAvatarVersion: number,
): boolean {
  return rowVersion === currentAvatarVersion;
}

export function sumAvatarBlobCacheBytes(rows: readonly { byteSize: number }[]): number {
  let total = 0;
  for (const row of rows) {
    total += row.byteSize;
  }
  return total;
}

/**
 * Returns row ids to delete (oldest first) until totals fit under limits.
 * `incomingBytes` is the size of a row about to be written (0 when only evicting).
 */
export function pickAvatarBlobEvictionIds(
  rows: readonly AvatarBlobCacheEvictionRow[],
  options: {
    incomingBytes?: number;
    maxTotalBytes?: number;
    maxEntries?: number;
  } = {},
): string[] {
  const incomingBytes = options.incomingBytes ?? 0;
  const maxTotalBytes = options.maxTotalBytes ?? AVATAR_BLOB_CACHE_MAX_TOTAL_BYTES;
  const maxEntries = options.maxEntries ?? AVATAR_BLOB_CACHE_MAX_ENTRIES;

  const sorted = [...rows].sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
  let totalBytes = sumAvatarBlobCacheBytes(sorted) + incomingBytes;
  let entryCount = sorted.length + (incomingBytes > 0 ? 1 : 0);
  const toDelete: string[] = [];

  for (const row of sorted) {
    if (totalBytes <= maxTotalBytes && entryCount <= maxEntries) break;
    toDelete.push(row.id);
    totalBytes -= row.byteSize;
    entryCount -= 1;
  }

  return toDelete;
}
