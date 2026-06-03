/**
 * Topic-partition helpers for wide-stream message cache writes.
 *
 * Wide API responses span multiple topics; IDB stores each topic under its own chat key.
 */
import type { MockMessage } from "~/shared/api/zulip.types";
import {
  upsertChatMessages,
  updateChatMetaPatch,
  type ChatMetaRow,
} from "~/shared/lib/message-cache-db";
import { chatKeyFromMockMessage } from "~/shared/lib/message-cache-keys.lib";
import { zulipMessageCacheWindowNForChatKey } from "~/shared/lib/zulip-message-window.lib";

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

// Wide-mode boundary events may touch several topic partitions in one batch.
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
      // Full refresh must clear reached flags so pagination can re-probe boundaries.
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
