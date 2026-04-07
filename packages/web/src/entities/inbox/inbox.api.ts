// Этот файл нужен для данных страницы /inbox.
// Что делает:
// 1) загружает unread с сервера (источник финальной актуальности);
// 2) строит локальный bootstrap из IDB, чтобы не показывать пустой loader.
// 3) best-effort дописывает unread snapshot в message IDB после refresh,
//    чтобы следующий cache-first bootstrap был свежим.

import { persistChatMessagesToIndexedDb } from "~/entities/message/message-local-cache.lib";
import { getCurrentInstance } from "~/shared/api/client";
import { fetchMessagesWithNarrow } from "~/shared/api/zulip-messages";
import type { MockMessage } from "~/shared/api/zulip.types";
import { createLogger, logApiCall } from "~/shared/lib/logger";
import { getInstanceMessagesAscending, upsertChatMessages } from "~/shared/lib/message-cache-db";
import { chatKeyFromMockMessage } from "~/shared/lib/message-cache-keys.lib";
import { zulipMessageCacheWindowNForChatKey } from "~/shared/lib/zulip-message-window.lib";
import { buildInboxEntries } from "./inbox.lib";
import type { InboxEntry } from "./inbox.types";

const log = createLogger("inbox:api");

async function persistUnreadMessagesToIdb(
  messages: readonly MockMessage[],
  currentUserId: number | null,
): Promise<void> {
  // Персист не должен влиять на UX страницы: если недоступен — молча выходим.
  if (!persistChatMessagesToIndexedDb()) return;
  const instanceId = getCurrentInstance()?.id;
  if (!instanceId || messages.length === 0) return;

  // Раскладываем unread по чатам (stream/topic или DM key),
  // чтобы писать в IDB теми же chat partition, что и chat page.
  const messagesByChatKey = new Map<string, MockMessage[]>();
  for (const message of messages) {
    const chatKey = chatKeyFromMockMessage(message, currentUserId);
    if (chatKey == null) continue;
    const existing = messagesByChatKey.get(chatKey);
    if (existing) {
      existing.push(message);
    } else {
      messagesByChatKey.set(chatKey, [message]);
    }
  }

  if (messagesByChatKey.size === 0) return;

  const entries = Array.from(messagesByChatKey.entries());
  // Пишем каждый chat-key независимо: частичная ошибка не должна ломать fetchInboxEntries.
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
    log.warn("Failed to persist inbox unread snapshot to message cache", {
      chatKey,
      error: String(result.reason),
    });
  });
}

// Серверная загрузка unread по narrow is:unread с последующей группировкой.
export async function fetchInboxEntries(
  currentUserId: number | null = null,
): Promise<InboxEntry[]> {
  const start = performance.now();
  try {
    const messages = await fetchMessagesWithNarrow(
      [{ operator: "is", operand: "unread" }],
      "newest",
      5000,
      0,
    );
    // Обновляем IDB snapshot best-effort: ошибка персиста не должна ломать API-ответ inbox.
    await persistUnreadMessagesToIdb(messages, currentUserId);
    const durationMs = Math.round(performance.now() - start);
    logApiCall("GET", "/messages?narrow=is:unread", { status: 200, durationMs });
    return buildInboxEntries(messages, currentUserId);
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    logApiCall("GET", "/messages?narrow=is:unread", {
      error: String(err),
      durationMs,
    });
    log.error("Failed to fetch inbox entries", { error: String(err) });
    throw err;
  }
}

// Локальный bootstrap inbox из текущего IDB-кэша сообщений.
// unread определяем по отсутствию флага "read" (эквивалент is:unread для UI-старта).
export async function hydrateInboxEntriesFromCache(
  instanceId: string | null,
  currentUserId: number | null = null,
): Promise<InboxEntry[]> {
  if (instanceId == null) return [];
  const messages = await getInstanceMessagesAscending(instanceId);
  const unread = messages.filter((message) => !message.flags?.includes("read"));
  return buildInboxEntries(unread, currentUserId);
}
