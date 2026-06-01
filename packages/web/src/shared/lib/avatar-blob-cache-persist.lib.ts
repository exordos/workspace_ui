/**
 * Feature toggle for persisting avatar blobs to IndexedDB.
 */

// TODO: re-enable after avatar fetch/CORS issues are resolved — was `env.AVATAR_PERSIST_INDEXEDDB`.
const AVATAR_BLOB_CACHE_ENABLED = false;

/** When true, avatar images may be read/written to IndexedDB. */
export function persistAvatarBlobsToIndexedDb(): boolean {
  return AVATAR_BLOB_CACHE_ENABLED;
}
