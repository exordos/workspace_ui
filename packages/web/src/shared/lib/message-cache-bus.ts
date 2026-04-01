/**
 * In-memory pub/sub for IndexedDB message cache updates (same tab).
 *
 * Notifies React hooks after writes so UI re-reads from IDB without polling.
 *
 * Usage:
 *   import { subscribeMessageCache, notifyMessageCache } from "~/shared/lib/message-cache-bus";
 */
type Listener = () => void;

const listeners = new Map<string, Set<Listener>>();

export function subscribeMessageCache(instanceChatKey: string, listener: Listener): () => void {
  let set = listeners.get(instanceChatKey);
  if (!set) {
    set = new Set();
    listeners.set(instanceChatKey, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
    if (set?.size === 0) {
      listeners.delete(instanceChatKey);
    }
  };
}

export function notifyMessageCache(instanceChatKey: string): void {
  const set = listeners.get(instanceChatKey);
  if (!set) return;
  for (const fn of set) {
    fn();
  }
}

export function notifyMessageCacheMany(instanceChatKeys: readonly string[]): void {
  const seen = new Set<string>();
  for (const key of instanceChatKeys) {
    if (seen.has(key)) continue;
    seen.add(key);
    notifyMessageCache(key);
  }
}
