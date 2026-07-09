/**
 * Centralized realm (custom org) emoji load and in-memory cache.
 * Legacy custom realm emoji loading is disabled until Workspace has a native source.
 */
import type { RealmEmoji } from "~/shared/api/zulip.types";

const EMPTY_REALM_EMOJIS: RealmEmoji[] = [];

let cachedRealmEmojis: RealmEmoji[] = EMPTY_REALM_EMOJIS;
let realmEmojisLoaded = false;

/** Synchronous cache snapshot for immediate UI init before effects run. */
export function getCachedRealmEmojis(): RealmEmoji[] {
  return cachedRealmEmojis;
}

/** Returns an empty cached result without a network request. */
export function ensureRealmEmojisLoaded(): Promise<RealmEmoji[]> {
  if (realmEmojisLoaded) {
    return Promise.resolve(cachedRealmEmojis);
  }

  cachedRealmEmojis = EMPTY_REALM_EMOJIS;
  realmEmojisLoaded = true;
  return Promise.resolve(EMPTY_REALM_EMOJIS);
}

/** Resets singleton state for isolated tests. */
export function resetRealmEmojisCacheForTests(): void {
  cachedRealmEmojis = EMPTY_REALM_EMOJIS;
  realmEmojisLoaded = false;
}
