import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import { dmConversationKey } from "~/shared/lib/dm-key";

// Зачем: храним компактный индекс DM в localStorage, чтобы восстановить список диалогов без глубокой загрузки сообщений.
const DM_INDEX_STORAGE_PREFIX = "workspace-dm-index";
// Зачем: ограничиваем размер кеша, чтобы он не рос бесконечно.
const DM_INDEX_MAX_ENTRIES = 2000;

export interface DmIndexEntry {
  dmKey: string;
  userIds: number[];
  lastActivityTs: number;
  lastMessageId: number | null;
  unreadCount?: number;
}

// Что делает: формирует ключ хранения индекса для конкретного инстанса.
function storageKey(instanceId: string): string {
  return `${DM_INDEX_STORAGE_PREFIX}:${instanceId}`;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

// Что делает: проверяет и нормализует одну запись индекса, чтобы в хранилище не попадали битые данные.
function normalizeEntry(entry: unknown): DmIndexEntry | null {
  if (entry == null || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }
  const row = entry as Record<string, unknown>;
  if (typeof row.dmKey !== "string" || row.dmKey.trim().length === 0) {
    return null;
  }
  if (!Array.isArray(row.userIds)) {
    return null;
  }
  const userIds = row.userIds.filter(isPositiveInteger);
  if (userIds.length === 0) {
    return null;
  }
  const uniqueSortedUserIds = Array.from(new Set(userIds)).sort((left, right) => left - right);
  const lastActivityTs =
    typeof row.lastActivityTs === "number" && Number.isFinite(row.lastActivityTs)
      ? Math.max(0, Math.trunc(row.lastActivityTs))
      : 0;
  const lastMessageId = isPositiveInteger(row.lastMessageId) ? row.lastMessageId : null;
  const unreadCount =
    typeof row.unreadCount === "number" && Number.isFinite(row.unreadCount)
      ? Math.max(0, Math.trunc(row.unreadCount))
      : undefined;
  return {
    dmKey: row.dmKey.trim(),
    userIds: uniqueSortedUserIds,
    lastActivityTs,
    lastMessageId,
    ...(unreadCount == null ? {} : { unreadCount }),
  };
}

export function loadDmIndexEntries(instanceId: string): DmIndexEntry[] {
  if (typeof window === "undefined") return [];
  const trimmedInstanceId = instanceId.trim();
  if (trimmedInstanceId.length === 0) return [];
  try {
    const raw = localStorage.getItem(storageKey(trimmedInstanceId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => normalizeEntry(entry))
      .filter((entry): entry is DmIndexEntry => entry != null)
      .sort((left, right) => right.lastActivityTs - left.lastActivityTs)
      .slice(0, DM_INDEX_MAX_ENTRIES);
  } catch {
    return [];
  }
}

// Что делает: объединяет новые записи с текущим индексом и оставляет только самые свежие.
export function upsertDmIndexEntries(instanceId: string, entries: readonly DmIndexEntry[]): void {
  if (typeof window === "undefined") return;
  const trimmedInstanceId = instanceId.trim();
  if (trimmedInstanceId.length === 0 || entries.length === 0) return;

  try {
    const next = new Map<string, DmIndexEntry>();
    for (const entry of loadDmIndexEntries(trimmedInstanceId)) {
      next.set(entry.dmKey, entry);
    }

    for (const incoming of entries) {
      const normalized = normalizeEntry(incoming);
      if (normalized == null) continue;
      const existing = next.get(normalized.dmKey);
      if (!existing) {
        next.set(normalized.dmKey, normalized);
        continue;
      }
      const lastActivityTs = Math.max(existing.lastActivityTs, normalized.lastActivityTs);
      const lastMessageId =
        existing.lastMessageId == null
          ? normalized.lastMessageId
          : normalized.lastMessageId == null
            ? existing.lastMessageId
            : Math.max(existing.lastMessageId, normalized.lastMessageId);
      // Если в новом источнике нет unreadCount, сохраняем старое значение.
      const unreadCount = normalized.unreadCount ?? existing.unreadCount;
      next.set(normalized.dmKey, {
        dmKey: normalized.dmKey,
        userIds: normalized.userIds,
        lastActivityTs,
        lastMessageId,
        ...(unreadCount == null ? {} : { unreadCount }),
      });
    }

    const rows = Array.from(next.values())
      .sort((left, right) => right.lastActivityTs - left.lastActivityTs)
      .slice(0, DM_INDEX_MAX_ENTRIES);
    localStorage.setItem(storageKey(trimmedInstanceId), JSON.stringify(rows));
  } catch {
    // best effort cache
  }
}

// Что делает: достает DM-ключи из сообщений и обновляет индекс без полной перестройки списка чатов.
export function upsertDmIndexFromMessages(
  instanceId: string,
  messages: readonly ZulipRawMessage[],
  currentUserId: number | null,
): void {
  const rows: DmIndexEntry[] = [];
  for (const message of messages) {
    if (message.type !== "private" || !Array.isArray(message.display_recipient)) continue;
    const userIds = message.display_recipient
      .map((recipient) => recipient.id)
      .filter(isPositiveInteger)
      .sort((left, right) => left - right);
    if (userIds.length === 0) continue;
    const dmKey = dmConversationKey(
      userIds.map((userId) => ({ id: userId })),
      currentUserId,
    );
    rows.push({
      dmKey,
      userIds: Array.from(new Set(userIds)),
      lastActivityTs: Math.max(0, message.timestamp),
      lastMessageId: message.id,
    });
  }
  if (rows.length > 0) {
    upsertDmIndexEntries(instanceId, rows);
  }
}
