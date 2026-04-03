// Этот файл нужен для данных страницы /inbox.
// Что делает:
// 1) загружает unread с сервера (источник финальной актуальности);
// 2) строит локальный bootstrap из IDB, чтобы не показывать пустой loader.

import { fetchMessagesWithNarrow } from "~/shared/api/zulip-messages";
import { createLogger, logApiCall } from "~/shared/lib/logger";
import { getInstanceMessagesAscending } from "~/shared/lib/message-cache-db";
import { buildInboxEntries } from "./inbox.lib";
import type { InboxEntry } from "./inbox.types";

const log = createLogger("inbox:api");

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
