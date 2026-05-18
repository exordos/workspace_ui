// Парсинг unread-данных Zulip.
// Поддерживает 2 источника:
// 1) legacy payload с unread_msgs (если где-то еще используется);
// 2) payload GET /messages с narrow is:unread (основной путь для текущего startup reconcile).
// Нужен для двух сценариев:
// 1) получить общий unread count;
// 2) получить подробный snapshot для reconcile chat-list unread.
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

// Проверка на валидный положительный integer-id.
function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

// Безопасная нормализация числовых счетчиков.
function toSafeCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.trunc(value));
}

// Читает список unread ids и отфильтровывает мусорные значения.
function parseUnreadMessageIds(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: number[] = [];
  for (const rawId of value) {
    if (!isPositiveInteger(rawId)) continue;
    result.push(rawId);
  }
  return result;
}

// Суммирует длины unread_message_ids по bucket-массиву.
function sumUnreadMessageIds(entries: unknown): number {
  if (!Array.isArray(entries)) {
    return 0;
  }
  return entries.reduce((sum, entry) => {
    if (!isRecord(entry)) return sum;
    return sum + parseUnreadMessageIds(entry.unread_message_ids).length;
  }, 0);
}

// Парсинг user_ids_string из huddle-бакетов в канонический отсортированный список userId.
function parseUserIdsString(value: unknown): number[] {
  if (typeof value !== "string") return [];
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) return [];
  const userIds: number[] = [];
  for (const part of parts) {
    const parsed = Number(part);
    if (!isPositiveInteger(parsed)) continue;
    userIds.push(parsed);
  }
  return Array.from(new Set(userIds)).sort((left, right) => left - right);
}

// Unread bucket для stream/topic.
export interface ZulipUnreadStreamBucket {
  streamId: number;
  topic: string;
  unreadMessageIds: number[];
}

// Unread bucket для DM/группового DM.
export interface ZulipUnreadDmBucket {
  userIds: number[];
  unreadMessageIds: number[];
  /** True for huddles / group DMs (excluded from personal DM badge counts). */
  isGroup?: boolean;
}

// Полный unread snapshot для reconcile sidebar unread.
export interface ZulipUnreadMessagesSnapshot {
  streams: ZulipUnreadStreamBucket[];
  dms: ZulipUnreadDmBucket[];
  totalCount: number;
}

// Парсит полный unread snapshot из legacy unread_msgs payload.
// Возвращает null, если payload не похож на ожидаемую структуру.
function parseUnreadMessagesSnapshotFromUnreadMsgs(
  payload: unknown,
): ZulipUnreadMessagesSnapshot | null {
  if (!isRecord(payload)) {
    return null;
  }
  const unreadMsgs = payload.unread_msgs;
  if (!isRecord(unreadMsgs)) {
    return null;
  }

  const streamsRaw = unreadMsgs.streams;
  const pmsRaw = unreadMsgs.pms;
  const huddlesRaw = unreadMsgs.huddles;

  if (!Array.isArray(streamsRaw) || !Array.isArray(pmsRaw) || !Array.isArray(huddlesRaw)) {
    return null;
  }

  const streams: ZulipUnreadStreamBucket[] = [];
  for (const entry of streamsRaw) {
    if (!isRecord(entry)) continue;
    const streamId = entry.stream_id;
    if (!isPositiveInteger(streamId)) continue;
    const topicRaw = typeof entry.topic === "string" ? entry.topic : "";
    const topic = normalizeTopicForIdentity(topicRaw);
    const unreadMessageIds = parseUnreadMessageIds(entry.unread_message_ids);
    if (unreadMessageIds.length === 0) continue;
    streams.push({ streamId, topic, unreadMessageIds });
  }

  const dms: ZulipUnreadDmBucket[] = [];
  for (const entry of pmsRaw) {
    if (!isRecord(entry)) continue;
    const senderId = entry.sender_id;
    if (!isPositiveInteger(senderId)) continue;
    const unreadMessageIds = parseUnreadMessageIds(entry.unread_message_ids);
    if (unreadMessageIds.length === 0) continue;
    dms.push({ userIds: [senderId], unreadMessageIds, isGroup: false });
  }

  for (const entry of huddlesRaw) {
    if (!isRecord(entry)) continue;
    const userIds = parseUserIdsString(entry.user_ids_string);
    if (userIds.length === 0) continue;
    const unreadMessageIds = parseUnreadMessageIds(entry.unread_message_ids);
    if (unreadMessageIds.length === 0) continue;
    dms.push({ userIds, unreadMessageIds, isGroup: true });
  }

  // Если сервер дал прямой count, используем его как authoritative total.
  // Иначе считаем fallback как сумму длин id-массивов.
  const directCount = toSafeCount(unreadMsgs.count);
  const totalCount =
    directCount > 0
      ? directCount
      : sumUnreadMessageIds(streamsRaw) +
        sumUnreadMessageIds(pmsRaw) +
        sumUnreadMessageIds(huddlesRaw) +
        sumUnreadMessageIds(unreadMsgs.mentions);

  return { streams, dms, totalCount };
}

function parseDmParticipantIds(message: Record<string, unknown>): number[] {
  const displayRecipient = message.display_recipient;
  if (Array.isArray(displayRecipient)) {
    const ids = displayRecipient
      .map((entry) => (isRecord(entry) ? entry.id : null))
      .filter((id): id is number => isPositiveInteger(id));
    if (ids.length > 0) {
      return Array.from(new Set(ids)).sort((left, right) => left - right);
    }
  }
  if (isPositiveInteger(message.sender_id)) {
    return [message.sender_id];
  }
  return [];
}

// Парсит полный unread snapshot из payload GET /messages?narrow=is:unread.
// Ожидает shape { messages: ZulipRawMessage[] }.
function parseUnreadMessagesSnapshotFromMessages(
  payload: unknown,
): ZulipUnreadMessagesSnapshot | null {
  if (!isRecord(payload) || !Array.isArray(payload.messages)) {
    return null;
  }

  const streamBuckets = new Map<string, ZulipUnreadStreamBucket>();
  const dmBuckets = new Map<string, ZulipUnreadDmBucket>();
  const unreadMessageIds = new Set<number>();

  for (const rawMessage of payload.messages) {
    if (!isRecord(rawMessage)) continue;
    const messageId = rawMessage.id;
    if (!isPositiveInteger(messageId)) continue;
    if (Array.isArray(rawMessage.flags) && rawMessage.flags.includes("read")) continue;

    unreadMessageIds.add(messageId);

    const isStreamMessage =
      rawMessage.type === "stream" ||
      (rawMessage.stream_id != null && isPositiveInteger(rawMessage.stream_id));
    if (isStreamMessage) {
      const streamId = rawMessage.stream_id;
      if (!isPositiveInteger(streamId)) continue;
      const topicRaw = typeof rawMessage.subject === "string" ? rawMessage.subject : "";
      const topic = normalizeTopicForIdentity(topicRaw);
      const key = `${streamId}\t${topic}`;
      const existing = streamBuckets.get(key);
      if (existing) {
        existing.unreadMessageIds.push(messageId);
      } else {
        streamBuckets.set(key, { streamId, topic, unreadMessageIds: [messageId] });
      }
      continue;
    }

    const participantIds = parseDmParticipantIds(rawMessage);
    if (participantIds.length === 0) continue;
    const key = participantIds.join(",");
    const existing = dmBuckets.get(key);
    if (existing) {
      existing.unreadMessageIds.push(messageId);
    } else {
      dmBuckets.set(key, {
        userIds: participantIds,
        unreadMessageIds: [messageId],
        isGroup: participantIds.length > 2,
      });
    }
  }

  return {
    streams: Array.from(streamBuckets.values()),
    dms: Array.from(dmBuckets.values()),
    totalCount: unreadMessageIds.size,
  };
}

// Парсит полный unread snapshot из поддерживаемых payload.
// Приоритет: legacy unread_msgs -> messages payload.
export function parseUnreadMessagesSnapshot(payload: unknown): ZulipUnreadMessagesSnapshot | null {
  const fromUnreadMsgs = parseUnreadMessagesSnapshotFromUnreadMsgs(payload);
  if (fromUnreadMsgs != null) {
    return fromUnreadMsgs;
  }
  return parseUnreadMessagesSnapshotFromMessages(payload);
}

/** DM badge polling uses GET /messages — prefer `messages` over stale `unread_msgs` on combined payloads. */
function parseUnreadDmMessagesSnapshot(payload: unknown): ZulipUnreadMessagesSnapshot | null {
  const fromMessages = parseUnreadMessagesSnapshotFromMessages(payload);
  if (fromMessages != null) {
    return fromMessages;
  }
  return parseUnreadMessagesSnapshotFromUnreadMsgs(payload);
}

/** Personal 1:1 for inactive-instance badge polling (stricter than sidebar row reconciliation). */
function isPersonalDmBucketForBadge(dm: ZulipUnreadDmBucket): boolean {
  if (dm.isGroup === true) return false;
  // Legacy `unread_msgs.pms` buckets only include the other party's user id.
  if (dm.userIds.length === 1) return true;
  // `/messages` buckets list every participant — only two-user conversations are 1:1.
  return dm.userIds.length === 2;
}

function countPersonalDmUnreadFromSnapshot(snapshot: ZulipUnreadMessagesSnapshot): number {
  let total = 0;
  for (const dm of snapshot.dms) {
    if (!isPersonalDmBucketForBadge(dm)) continue;
    total += dm.unreadMessageIds.length;
  }
  return total;
}

// Лёгкий helper только для общего unread count.
export function parseUnreadMessagesCount(payload: unknown): number | null {
  const snapshot = parseUnreadMessagesSnapshot(payload);
  if (snapshot == null) {
    return null;
  }
  return snapshot.totalCount;
}

/**
 * Personal DM unread flag for inactive-instance polling (0 or 1).
 * Uses conversation-level presence in personal DM buckets, not global `unread_msgs.count`.
 */
export function parseUnreadDmMessagesCount(payload: unknown): number | null {
  const snapshot = parseUnreadDmMessagesSnapshot(payload);
  if (snapshot == null) {
    return null;
  }
  return countPersonalDmUnreadFromSnapshot(snapshot) > 0 ? 1 : 0;
}
