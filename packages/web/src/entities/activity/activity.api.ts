// Этот файл нужен для данных страницы /activity.
// Что делает:
// 1) загружает activity page с сервера (источник финальной актуальности);
// 2) best-effort дописывает серверный snapshot в message IDB после refresh,
//    чтобы следующий cache-first bootstrap был свежее.
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

// Best-effort обновляет message IDB snapshot после серверного refresh activity.
// Ошибки персиста не должны ломать загрузку страницы.
async function persistActivityMessagesToIdb(
  messages: readonly ZulipRawMessage[],
  currentUserId: number | null,
): Promise<void> {
  // Если фича персиста отключена или писать нечего — сразу выходим.
  if (!persistChatMessagesToIndexedDb()) return;
  const instanceId = getCurrentInstance()?.id;
  if (!instanceId || messages.length === 0) return;

  // Группируем серверные сообщения по chatKey, чтобы писать в IDB теми же чат-партициями.
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
  // Пишем каждый chatKey независимо: частичные ошибки логируем, но не пробрасываем наружу.
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

// Обертка над fetchActivityMessagesPage:
// 1) получает authoritative страницу activity с сервера;
// 2) best-effort синхронизирует этот snapshot в message IDB.
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
