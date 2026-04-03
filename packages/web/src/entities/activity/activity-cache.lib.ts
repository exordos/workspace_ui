// Этот файл нужен для локального bootstrap страницы /activity из IDB.
// Кэш используется только для быстрого первого кадра, а финальная актуальность
// всегда приходит с серверного refresh.
import type { ActivityFilter, MockMessage, ZulipRawMessage } from "~/shared/api/zulip.types";
import { getInstanceMessagesAscending } from "~/shared/lib/message-cache-db";

function mockMessageToRawMessage(message: MockMessage): ZulipRawMessage {
  const displayRecipient =
    message.display_recipient ?? (message.stream_id != null ? (message.channel ?? "") : undefined);
  const isPrivate =
    message.stream_id == null &&
    (Array.isArray(displayRecipient) || typeof displayRecipient !== "string");

  return {
    id: message.id,
    sender_id: message.sender_id,
    sender_full_name: message.sender_full_name,
    content: message.content,
    timestamp: message.timestamp,
    display_recipient: displayRecipient,
    subject: message.subject,
    type: isPrivate ? "private" : "stream",
    stream_id: message.stream_id,
    flags: message.flags,
    reactions: message.reactions,
  };
}

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

// Возвращает локальный срез под выбранный фильтр (oldest -> newest),
// чтобы формат соответствовал серверной пагинации страницы.
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
