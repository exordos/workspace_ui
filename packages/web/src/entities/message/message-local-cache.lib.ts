/**
 * Chat message disk persistence toggle (IndexedDB when enabled).
 * No localStorage — in-memory store only when persistence is off.
 */
import { env } from "~/shared/lib/env";

/** When true, messages persist to IndexedDB; UI still reads from Zustand only. */
export function persistChatMessagesToIndexedDb(): boolean {
  return env.CHAT_MESSAGES_PERSIST_INDEXEDDB;
}
