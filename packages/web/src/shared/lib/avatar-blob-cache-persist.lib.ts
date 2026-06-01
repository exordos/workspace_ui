/**
 * Feature toggle for persisting avatar blobs to IndexedDB.
 */
import { env } from "~/shared/lib/env";

/** When true, avatar images may be read/written to IndexedDB. */
export function persistAvatarBlobsToIndexedDb(): boolean {
  return env.AVATAR_PERSIST_INDEXEDDB;
}
