import type { MockMessage } from "~/shared/api/zulip.types";
import {
  upsertChatMessages,
  updateChatMetaPatch,
  type ChatMetaRow,
} from "~/shared/lib/message-cache-db";
import { chatKeyFromMockMessage } from "~/shared/lib/message-cache-keys.lib";
import { zulipMessageCacheWindowNForChatKey } from "~/shared/lib/zulip-message-window.lib";

// Зачем: в wide-режиме сервер отдаёт сообщения из разных топиков,
// а в кэше мы храним их по topic-partition key. Эта функция делает такую группировку.
export function groupMessagesByChatKey(
  messages: readonly MockMessage[],
  currentUserId: number | null,
): Map<string, MockMessage[]> {
  const grouped = new Map<string, MockMessage[]>();
  for (const message of messages) {
    const chatKey = chatKeyFromMockMessage(message, currentUserId);
    if (chatKey == null) continue;
    const existing = grouped.get(chatKey);
    if (existing) {
      existing.push(message);
      continue;
    }
    grouped.set(chatKey, [message]);
  }
  return grouped;
}

// Зачем: при boundary-событиях (дошли до oldest/newest) в wide-режиме нужно обновлять meta
// не одного чата, а всех topic-partitions, куда попали сообщения.
export async function patchPartitionMetaByMessages(options: {
  instanceId: string;
  currentUserId: number | null;
  messages: readonly MockMessage[];
  patch: Partial<
    Pick<
      ChatMetaRow,
      | "hasGaps"
      | "windowSizeN"
      | "lastEventIdApplied"
      | "newestMessageId"
      | "oldestMessageId"
      | "reachedOldest"
      | "reachedNewest"
    >
  >;
}): Promise<void> {
  const grouped = groupMessagesByChatKey(options.messages, options.currentUserId);
  if (grouped.size === 0) return;
  await Promise.all(
    Array.from(grouped.keys()).map((chatKey) =>
      updateChatMetaPatch(options.instanceId, chatKey, options.patch),
    ),
  );
}

// Зачем: единая запись набора сообщений по корректным topic-partitions.
// Это предотвращает смешивание wide-ленты в один ключ `stream:{id}:general`.
export async function upsertMessagesByChatPartitions(options: {
  instanceId: string;
  currentUserId: number | null;
  messages: readonly MockMessage[];
  resetBoundaries?: boolean;
}): Promise<void> {
  const grouped = groupMessagesByChatKey(options.messages, options.currentUserId);
  if (grouped.size === 0) return;

  await Promise.all(
    Array.from(grouped.entries()).map(async ([chatKey, chatMessages]) => {
      // Что делает: при full-refresh сбрасывает reached-флаги,
      // чтобы boundary-пагинация после refresh работала корректно.
      if (options.resetBoundaries) {
        await updateChatMetaPatch(options.instanceId, chatKey, {
          reachedOldest: false,
          reachedNewest: false,
        });
      }
      await upsertChatMessages({
        instanceId: options.instanceId,
        chatKey,
        messages: chatMessages,
        windowSizeN: zulipMessageCacheWindowNForChatKey(chatKey),
      });
    }),
  );
}
