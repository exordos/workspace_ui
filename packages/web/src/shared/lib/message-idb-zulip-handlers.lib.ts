/**
 * Per-event IndexedDB mirrors for Zulip realtime events (`message-idb-from-zulip.lib.ts`).
 */
import { rawMessageToMockMessage } from "~/shared/api/zulip-messages";
import type { ZulipEvent, ZulipRawMessage } from "~/shared/api/zulip.types";
import {
  deleteMessagesByIds,
  moveTopicMessagesInCache,
  moveTopicToStreamInCache,
  patchMessageContentInCache,
  patchMessageFlagsInCache,
  patchMessageReactionInCache,
  putSingleMessage,
} from "~/shared/lib/message-cache-db";
import { chatKeyFromRawMessage } from "~/shared/lib/message-cache-keys.lib";
import { extractStreamMoveFromUpdateEvent } from "~/shared/lib/update-message-stream-move.lib";
import { extractTopicMoveFromUpdateEvent } from "~/shared/lib/update-message-topic-move.lib";
import { zulipMessageCacheWindowNForChatKey } from "~/shared/lib/zulip-message-window.lib";

export async function mirrorZulipMessageEventToIndexedDb(options: {
  instanceId: string;
  currentUserId: number | null;
  raw: ZulipRawMessage;
}): Promise<void> {
  const chatKey = chatKeyFromRawMessage(options.raw, options.currentUserId);
  if (chatKey == null) return;
  const mock = rawMessageToMockMessage(options.raw);
  await putSingleMessage({
    instanceId: options.instanceId,
    chatKey,
    message: mock,
    windowSizeN: zulipMessageCacheWindowNForChatKey(chatKey),
  });
}

export async function mirrorZulipUpdateMessageFlagsToIndexedDb(options: {
  instanceId: string;
  event: ZulipEvent;
}): Promise<void> {
  const op = options.event.op as "add" | "remove";
  const flag = options.event.flag as string;
  const messageIds = (options.event.messages ?? []) as number[];
  if (messageIds.length === 0) return;
  await patchMessageFlagsInCache({ instanceId: options.instanceId, messageIds, flag, op });
}

export async function mirrorZulipReactionToIndexedDb(options: {
  instanceId: string;
  event: ZulipEvent;
}): Promise<void> {
  const messageId = options.event.message_id as number;
  const reaction =
    options.event.emoji_name != null
      ? {
          emoji_name: options.event.emoji_name as string,
          emoji_code: (options.event.emoji_code as string) ?? "",
          reaction_type:
            (options.event.reaction_type as
              | "unicode_emoji"
              | "realm_emoji"
              | "zulip_extra_emoji") ?? "unicode_emoji",
          user_id: options.event.user_id as number,
        }
      : null;
  if (!reaction) return;
  const op = (options.event.op as "add" | "remove") ?? "add";
  await patchMessageReactionInCache({ instanceId: options.instanceId, messageId, reaction, op });
}

export function resolveDeleteMessageIdsFromZulipEvent(event: ZulipEvent): number[] {
  if (event.message_ids) return event.message_ids as number[];
  if (event.message_id != null) return [event.message_id as number];
  return [];
}

export async function mirrorZulipDeleteMessageToIndexedDb(options: {
  instanceId: string;
  event: ZulipEvent;
}): Promise<void> {
  const messageIds = resolveDeleteMessageIdsFromZulipEvent(options.event);
  if (messageIds.length === 0) return;
  await deleteMessagesByIds(options.instanceId, messageIds);
}

export async function mirrorZulipUpdateMessageToIndexedDb(options: {
  instanceId: string;
  event: ZulipEvent;
}): Promise<void> {
  const messageId = options.event.message_id as number | undefined;
  const renderingOnly = options.event.rendering_only === true;
  const newMarkdown =
    !renderingOnly && typeof options.event.content === "string" ? options.event.content : undefined;
  if (messageId != null && newMarkdown != null) {
    const trimmed = newMarkdown.trim();
    await patchMessageContentInCache({
      instanceId: options.instanceId,
      messageId,
      content: newMarkdown,
      ...(trimmed.length > 0 ? { markdown_source: newMarkdown } : {}),
    });
  }

  const streamMovePayload = extractStreamMoveFromUpdateEvent(options.event);
  if (streamMovePayload != null) {
    await moveTopicToStreamInCache({
      instanceId: options.instanceId,
      ...streamMovePayload,
    });
    return;
  }

  const topicMovePayload = extractTopicMoveFromUpdateEvent(options.event);
  if (topicMovePayload == null) return;
  await moveTopicMessagesInCache({
    instanceId: options.instanceId,
    ...topicMovePayload,
  });
}
