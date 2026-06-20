/**
 * Applies Zulip realtime events to the IndexedDB message cache when persist is enabled.
 *
 * Zustand is updated separately in the layout dispatcher; this module only mirrors to IDB.
 *
 * Usage:
 *   import { applyZulipEventToMessageIndexedDb } from "~/shared/lib/message-idb-from-zulip.lib";
 */
import type { ZulipEvent, ZulipRawMessage } from "~/shared/api/zulip.types";
import { env } from "~/shared/lib/env";
import {
  mirrorZulipDeleteMessageToIndexedDb,
  mirrorZulipMessageEventToIndexedDb,
  mirrorZulipReactionToIndexedDb,
  mirrorZulipUpdateMessageFlagsToIndexedDb,
  mirrorZulipUpdateMessageToIndexedDb,
} from "~/shared/lib/message-idb-zulip-handlers.lib";

export function isChatMessagesPersistToIndexedDbEnabled(): boolean {
  return env.CHAT_MESSAGES_PERSIST_INDEXEDDB;
}

export async function applyZulipEventToMessageIndexedDb(options: {
  instanceId: string;
  currentUserId: number | null;
  event: ZulipEvent;
}): Promise<void> {
  if (!isChatMessagesPersistToIndexedDbEnabled()) return;
  const { instanceId, currentUserId, event } = options;

  if (event.type === "message" && event.message) {
    await mirrorZulipMessageEventToIndexedDb({
      instanceId,
      currentUserId,
      raw: event.message as unknown as ZulipRawMessage,
    });
    return;
  }

  if (event.type === "update_message_flags") {
    await mirrorZulipUpdateMessageFlagsToIndexedDb({ instanceId, event });
    return;
  }

  if (event.type === "reaction") {
    await mirrorZulipReactionToIndexedDb({ instanceId, event });
    return;
  }

  if (event.type === "delete_message") {
    await mirrorZulipDeleteMessageToIndexedDb({ instanceId, event });
    return;
  }

  if (event.type === "update_message") {
    await mirrorZulipUpdateMessageToIndexedDb({ instanceId, event });
  }
}
