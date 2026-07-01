/**
 * Per-event IndexedDB mirrors for the messenger API realtime events (`message-idb-from-messenger.lib.ts`).
 */
import { rawMessageToMockMessage } from "~/shared/api/messenger-messages";
import type { MessengerEvent, WorkspaceRawMessage } from "~/shared/api/messenger.types";
import {
  deleteMessagesByIds,
  moveTopicMessagesInCache,
  moveTopicToStreamInCache,
  patchMessageContentInCache,
  patchMessageFlagsInCache,
  putSingleMessage,
} from "~/shared/lib/message-cache-db";
import { chatKeyFromRawMessage } from "~/shared/lib/message-cache-keys.lib";
import { normalizeMessageId } from "~/shared/lib/message-id.lib";
import type { MessageId } from "~/shared/lib/message-id.lib";
import { messengerMessageCacheWindowNForChatKey } from "~/shared/lib/messenger-message-window.lib";
import { extractStreamMoveFromUpdateEvent } from "~/shared/lib/update-message-stream-move.lib";
import { extractTopicMoveFromUpdateEvent } from "~/shared/lib/update-message-topic-move.lib";
import type { UserId } from "~/shared/lib/user-id.lib";

export async function mirrorMessengerMessageEventToIndexedDb(options: {
  instanceId: string;
  currentUserId: UserId | null;
  raw: WorkspaceRawMessage;
}): Promise<void> {
  const chatKey = chatKeyFromRawMessage(options.raw, options.currentUserId);
  if (chatKey == null) return;
  const mock = rawMessageToMockMessage(options.raw);
  await putSingleMessage({
    instanceId: options.instanceId,
    chatKey,
    message: mock,
    windowSizeN: messengerMessageCacheWindowNForChatKey(chatKey),
  });
}

export async function mirrorMessengerUpdateMessageFlagsToIndexedDb(options: {
  instanceId: string;
  event: MessengerEvent;
}): Promise<void> {
  const op = options.event.op as "add" | "remove";
  const flag = options.event.flag as string;
  const messageIds = Array.isArray(options.event.messages)
    ? options.event.messages.map(normalizeMessageId).filter((id) => id != null)
    : [];
  if (messageIds.length === 0) return;
  await patchMessageFlagsInCache({ instanceId: options.instanceId, messageIds, flag, op });
}

export async function mirrorMessengerMessagesReadToIndexedDb(options: {
  instanceId: string;
  event: MessengerEvent;
}): Promise<void> {
  const messageIds = Array.isArray(options.event.message_uuids)
    ? options.event.message_uuids.map(normalizeMessageId).filter((id) => id != null)
    : [];
  if (messageIds.length === 0) return;
  await patchMessageFlagsInCache({
    instanceId: options.instanceId,
    messageIds,
    flag: "read",
    op: "add",
  });
}

export function resolveDeleteMessageIdsFromMessengerEvent(event: MessengerEvent): MessageId[] {
  if (Array.isArray(event.message_ids)) {
    return event.message_ids.map(normalizeMessageId).filter((id) => id != null);
  }
  const messageId = normalizeMessageId(event.message_id);
  if (messageId != null) return [messageId];
  if (event.message != null && typeof event.message === "object") {
    const row = event.message as { id?: unknown; uuid?: unknown };
    const nestedMessageId = normalizeMessageId(row.id) ?? normalizeMessageId(row.uuid);
    if (nestedMessageId != null) return [nestedMessageId];
  }
  return [];
}

export async function mirrorMessengerDeleteMessageToIndexedDb(options: {
  instanceId: string;
  event: MessengerEvent;
}): Promise<void> {
  const messageIds = resolveDeleteMessageIdsFromMessengerEvent(options.event);
  if (messageIds.length === 0) return;
  await deleteMessagesByIds(options.instanceId, messageIds);
}

export async function mirrorMessengerUpdateMessageToIndexedDb(options: {
  instanceId: string;
  event: MessengerEvent;
}): Promise<void> {
  const messageId = normalizeMessageId(options.event.message_id);
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
