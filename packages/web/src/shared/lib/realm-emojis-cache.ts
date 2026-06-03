/**
 * Centralized realm (custom org) emoji load and in-memory cache.
 * Deduplicates parallel fetches and exposes a test reset hook.
 */
import { fetchRealmEmojis } from "~/shared/api/zulip-users";
import type { RealmEmoji } from "~/shared/api/zulip.types";

const EMPTY_REALM_EMOJIS: RealmEmoji[] = [];

let cachedRealmEmojis: RealmEmoji[] = EMPTY_REALM_EMOJIS;
let realmEmojisLoaded = false;
let inFlightRealmEmojisRequest: Promise<RealmEmoji[]> | null = null;

/** Synchronous cache snapshot for immediate UI init before effects run. */
export function getCachedRealmEmojis(): RealmEmoji[] {
  return cachedRealmEmojis;
}

/** Loads realm emojis once; reuses in-flight request and cached result. */
export function ensureRealmEmojisLoaded(): Promise<RealmEmoji[]> {
  if (realmEmojisLoaded) {
    return Promise.resolve(cachedRealmEmojis);
  }
  if (inFlightRealmEmojisRequest != null) {
    return inFlightRealmEmojisRequest;
  }

  inFlightRealmEmojisRequest = fetchRealmEmojis()
    .then((list) => {
      const normalized = list.length > 0 ? list : EMPTY_REALM_EMOJIS;
      cachedRealmEmojis = normalized;
      realmEmojisLoaded = true;
      return normalized;
    })
    .finally(() => {
      inFlightRealmEmojisRequest = null;
    });

  return inFlightRealmEmojisRequest;
}

/** Resets singleton state for isolated tests. */
export function resetRealmEmojisCacheForTests(): void {
  cachedRealmEmojis = EMPTY_REALM_EMOJIS;
  realmEmojisLoaded = false;
  inFlightRealmEmojisRequest = null;
}
