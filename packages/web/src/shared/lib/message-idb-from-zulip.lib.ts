/**
 * Applies Zulip realtime events to the IndexedDB message cache when persist is enabled.
 *
 * Zustand is updated separately in the layout dispatcher; this module only mirrors to IDB.
 *
 * Usage:
 *   import { applyZulipEventToMessageIndexedDb } from "~/shared/lib/message-idb-from-zulip.lib";
 */
import { rawMessageToMockMessage } from "~/shared/api/zulip";
import type { ZulipEvent, ZulipRawMessage } from "~/shared/api/zulip.types";
import { env } from "~/shared/lib/env";
import {
  deleteMessagesByIds,
  patchMessageContentInCache,
  patchMessageFlagsInCache,
  patchMessageReactionInCache,
  putSingleMessage,
} from "~/shared/lib/message-cache-db";
import { chatKeyFromRawMessage } from "~/shared/lib/message-cache-keys.lib";
import { zulipMessageCacheWindowNForChatKey } from "~/shared/lib/zulip-message-window.lib";

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
    const raw = event.message as unknown as ZulipRawMessage;
    const chatKey = chatKeyFromRawMessage(raw, currentUserId);
    if (chatKey == null) return;
    const mock = rawMessageToMockMessage(raw);
    await putSingleMessage({
      instanceId,
      chatKey,
      message: mock,
      windowSizeN: zulipMessageCacheWindowNForChatKey(chatKey),
    });
    return;
  }

  if (event.type === "update_message_flags") {
    const op = event.op as "add" | "remove";
    const flag = event.flag as string;
    const messageIds = (event.messages ?? []) as number[];
    if (messageIds.length === 0) return;
    await patchMessageFlagsInCache({ instanceId, messageIds, flag, op });
    return;
  }

  if (event.type === "reaction") {
    const messageId = event.message_id as number;
    const reaction =
      event.emoji_name != null
        ? {
            emoji_name: event.emoji_name as string,
            emoji_code: (event.emoji_code as string) ?? "",
            reaction_type:
              (event.reaction_type as "unicode_emoji" | "realm_emoji" | "zulip_extra_emoji") ??
              "unicode_emoji",
            user_id: event.user_id as number,
          }
        : null;
    if (!reaction) return;
    const op = (event.op as "add" | "remove") ?? "add";
    await patchMessageReactionInCache({ instanceId, messageId, reaction, op });
    return;
  }

  if (event.type === "delete_message") {
    const messageIds = event.message_ids
      ? (event.message_ids as number[])
      : event.message_id != null
        ? [event.message_id as number]
        : [];
    if (messageIds.length > 0) {
      await deleteMessagesByIds(instanceId, messageIds);
    }
    return;
  }

  if (event.type === "update_message") {
    const messageId = event.message_id as number | undefined;
    const newContent = event.rendered_content as string | undefined;
    if (messageId != null && newContent != null) {
      await patchMessageContentInCache({ instanceId, messageId, content: newContent });
    }
  }
}
