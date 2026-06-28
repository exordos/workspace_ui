/**
 * Applies Workspace realtime events to the IndexedDB message cache when persist is enabled.
 *
 * Zustand is updated separately in the layout dispatcher; this module only mirrors to IDB.
 *
 * Usage:
 *   import { applyMessengerEventToMessageIndexedDb } from "~/shared/lib/message-idb-from-messenger.lib";
 */
import type { MessengerEvent, WorkspaceRawMessage } from "~/shared/api/messenger.types";
import { env } from "~/shared/lib/env";
import {
  mirrorMessengerDeleteMessageToIndexedDb,
  mirrorMessengerMessageEventToIndexedDb,
  mirrorMessengerMessagesReadToIndexedDb,
  mirrorMessengerReactionToIndexedDb,
  mirrorMessengerUpdateMessageFlagsToIndexedDb,
  mirrorMessengerUpdateMessageToIndexedDb,
} from "~/shared/lib/message-idb-handlers.lib";
import type { UserId } from "~/shared/lib/user-id.lib";

export function isChatMessagesPersistToIndexedDbEnabled(): boolean {
  return env.CHAT_MESSAGES_PERSIST_INDEXEDDB;
}

export async function applyMessengerEventToMessageIndexedDb(options: {
  instanceId: string;
  currentUserId: UserId | null;
  event: MessengerEvent;
}): Promise<void> {
  if (!isChatMessagesPersistToIndexedDbEnabled()) return;
  const { instanceId, currentUserId, event } = options;

  if (event.type === "message") {
    if (event.kind === "messages.read") {
      await mirrorMessengerMessagesReadToIndexedDb({ instanceId, event });
      return;
    }
    if (event.message) {
      if (event.kind === "message.deleted") {
        await mirrorMessengerDeleteMessageToIndexedDb({ instanceId, event });
        return;
      }
      await mirrorMessengerMessageEventToIndexedDb({
        instanceId,
        currentUserId,
        raw: event.message as unknown as WorkspaceRawMessage,
      });
      return;
    }
  }

  if (event.type === "update_message_flags") {
    await mirrorMessengerUpdateMessageFlagsToIndexedDb({ instanceId, event });
    return;
  }

  if (event.type === "reaction") {
    await mirrorMessengerReactionToIndexedDb({ instanceId, event });
    return;
  }

  if (event.type === "delete_message") {
    await mirrorMessengerDeleteMessageToIndexedDb({ instanceId, event });
    return;
  }

  if (event.type === "update_message") {
    await mirrorMessengerUpdateMessageToIndexedDb({ instanceId, event });
  }
}
