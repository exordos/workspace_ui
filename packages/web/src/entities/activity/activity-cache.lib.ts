// Этот файл нужен для локального bootstrap страницы /activity из IDB.
// Кэш используется только для быстрого первого кадра, а финальная актуальность
// всегда приходит с серверного refresh.
import type { ActivityFilter, MockMessage, ZulipRawMessage } from "~/shared/api/zulip.types";
import { getInstanceMessagesAscending } from "~/shared/lib/message-cache-db";
import { mockMessageToRawMessage } from "~/shared/lib/message-mock-to-raw.lib";

// Возвращает самый новый timestamp в snapshot сообщений.
// Нужен как основной критерий свежести кэша.
function getActivityMessagesNewestTimestamp(messages: readonly ZulipRawMessage[]): number {
  if (messages.length === 0) return 0;
  let newest = messages[0]?.timestamp ?? 0;
  for (const message of messages) {
    if (message.timestamp > newest) {
      newest = message.timestamp;
    }
  }
  return newest;
}

// Возвращает максимальный message.id в snapshot.
// Нужен как tie-breaker, когда timestamp совпадает.
function getActivityMessagesMaxMessageId(messages: readonly ZulipRawMessage[]): number {
  let maxId = 0;
  for (const message of messages) {
    if (message.id > maxId) {
      maxId = message.id;
    }
  }
  return maxId;
}

// Возвращает true, если `candidate` объективно свежее `current`.
// Сначала сравниваем максимальный timestamp, затем max message.id.
export function isActivityMessagesSnapshotFresher(
  candidate: readonly ZulipRawMessage[],
  current: readonly ZulipRawMessage[],
): boolean {
  if (candidate.length === 0) return false;
  if (current.length === 0) return true;

  const candidateNewestTimestamp = getActivityMessagesNewestTimestamp(candidate);
  const currentNewestTimestamp = getActivityMessagesNewestTimestamp(current);
  if (candidateNewestTimestamp !== currentNewestTimestamp) {
    return candidateNewestTimestamp > currentNewestTimestamp;
  }

  const candidateMaxMessageId = getActivityMessagesMaxMessageId(candidate);
  const currentMaxMessageId = getActivityMessagesMaxMessageId(current);
  return candidateMaxMessageId > currentMaxMessageId;
}

// Проверяет, подходит ли сообщение под выбранный activity-фильтр.
// Используется только для локального cache bootstrap.
function matchesActivityFilter(
  message: MockMessage,
  filter: ActivityFilter,
  currentUserId: number | null,
): boolean {
  const flags = message.flags ?? [];
  if (filter === "starred") {
    return flags.includes("starred");
  }
  if (filter === "mentions") {
    return flags.includes("mentioned");
  }
  if ((message.reactions?.length ?? 0) === 0) {
    return false;
  }
  if (currentUserId == null) {
    return true;
  }
  // Для reactions используем ту же текущую логику, что и на странице:
  // события привязываются к сообщениям текущего пользователя.
  return message.sender_id === currentUserId;
}

// Возвращает локальный срез под выбранный фильтр (oldest -> newest).
// Формат соответствует серверной пагинации, чтобы UI не "прыгал" между hydrate и refresh.
export async function hydrateActivityMessagesFromCache(
  instanceId: string | null,
  filter: ActivityFilter,
  currentUserId: number | null,
  limit = 200,
): Promise<ZulipRawMessage[]> {
  if (instanceId == null) return [];
  const all = await getInstanceMessagesAscending(instanceId);
  const filtered = all.filter((message) => matchesActivityFilter(message, filter, currentUserId));
  const tail = filtered.length <= limit ? filtered : filtered.slice(filtered.length - limit);
  return tail.map(mockMessageToRawMessage);
}
