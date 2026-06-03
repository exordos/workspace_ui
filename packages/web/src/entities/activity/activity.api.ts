/**
 * Activity data layer — server page fetch and best-effort message IDB sync after refresh.
 */
import { persistChatMessagesToIndexedDb } from "~/entities/message/message-local-cache.lib";
import { getCurrentInstance } from "~/shared/api/client";
import { fetchActivityMessagesPage, rawMessageToMockMessage } from "~/shared/api/zulip-messages";
import type {
  ActivityFilter,
  ActivityMessagesPageResult,
  ZulipRawMessage,
} from "~/shared/api/zulip.types";
import { createLogger } from "~/shared/lib/logger";
import { upsertChatMessages } from "~/shared/lib/message-cache-db";
import { chatKeyFromMockMessage } from "~/shared/lib/message-cache-keys.lib";
import { zulipMessageCacheWindowNForChatKey } from "~/shared/lib/zulip-message-window.lib";

const log = createLogger("activity:api");

async function persistActivityMessagesToIdb(
  messages: readonly ZulipRawMessage[],
  currentUserId: number | null,
): Promise<void> {
  if (!persistChatMessagesToIndexedDb()) return;
  const instanceId = getCurrentInstance()?.id;
  if (!instanceId || messages.length === 0) return;

  const messagesByChatKey = new Map<string, ReturnType<typeof rawMessageToMockMessage>[]>();
  for (const message of messages) {
    const mapped = rawMessageToMockMessage(message);
    const chatKey = chatKeyFromMockMessage(mapped, currentUserId);
    if (chatKey == null) continue;
    const existing = messagesByChatKey.get(chatKey);
    if (existing) {
      existing.push(mapped);
    } else {
      messagesByChatKey.set(chatKey, [mapped]);
    }
  }

  if (messagesByChatKey.size === 0) return;
  const entries = Array.from(messagesByChatKey.entries());
  const results = await Promise.allSettled(
    entries.map(([chatKey, chatMessages]) =>
      upsertChatMessages({
        instanceId,
        chatKey,
        messages: chatMessages,
        windowSizeN: zulipMessageCacheWindowNForChatKey(chatKey),
      }),
    ),
  );

  results.forEach((result, index) => {
    if (result.status === "fulfilled") return;
    const chatKey = entries[index]?.[0] ?? "unknown";
    log.warn("Failed to persist activity snapshot to message cache", {
      chatKey,
      error: String(result.reason),
    });
  });
}

export async function fetchActivityMessagesPageWithPersist(
  filter: ActivityFilter,
  currentUserId?: number | null,
  anchor: number | "newest" = "newest",
  numBefore = 200,
): Promise<ActivityMessagesPageResult> {
  const normalizedCurrentUserId = currentUserId ?? null;
  const page = await fetchActivityMessagesPage(filter, normalizedCurrentUserId, anchor, numBefore);
  await persistActivityMessagesToIdb(page.messages, normalizedCurrentUserId);
  return page;
}
