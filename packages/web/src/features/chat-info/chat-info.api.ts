import { fetchStreamMembers, fetchStreams, type MockStream } from "~/shared/api/zulip";

// Слой загрузки данных chat-info:
// eager-загрузка участников и метадаты стрима.
// Здесь же живут TTL-кэш, in-flight dedupe и инвалидация.
interface CacheEntry<T> {
  // Кэшированное значение ресурса.
  value: T;
  // Время, после которого запись считается устаревшей.
  expiresAt: number;
}

// TTL для списка участников стрима.
const MEMBERS_TTL_MS = 60_000;
// TTL для snapshot списка стримов (используем для description).
const STREAMS_TTL_MS = 5 * 60_000;

// Кэш участников по ключу instanceId:streamId.
const streamMembersCache = new Map<string, CacheEntry<number[]>>();
// Кэш snapshot стримов по instanceId.
const streamsSnapshotCache = new Map<string, CacheEntry<MockStream[]>>();

// Карта активных запросов участников, чтобы не дублировать один и тот же fetch.
const streamMembersInFlight = new Map<string, Promise<number[]>>();
// Карта активных запросов snapshot стримов.
const streamsSnapshotInFlight = new Map<string, Promise<MockStream[]>>();

// Стабильный ключ ресурса участников стрима.
function streamMembersCacheKey(instanceId: string, streamId: number): string {
  return `${instanceId}:${streamId}`;
}

// Проверка, что запись в кэше еще не просрочена.
function isEntryFresh<T>(entry: CacheEntry<T> | undefined, now: number): entry is CacheEntry<T> {
  return entry != null && entry.expiresAt > now;
}

export async function loadStreamMembers(
  instanceId: string,
  streamId: number,
  options?: { force?: boolean },
): Promise<number[]> {
  // Порядок: cache -> in-flight -> сеть -> cache.
  const key = streamMembersCacheKey(instanceId, streamId);
  const now = Date.now();
  if (!options?.force) {
    const cached = streamMembersCache.get(key);
    if (isEntryFresh(cached, now)) {
      return [...cached.value];
    }
  }

  const inFlight = streamMembersInFlight.get(key);
  if (inFlight) {
    return inFlight;
  }

  const request = fetchStreamMembers(streamId)
    .then((memberIds) => {
      const next = [...memberIds];
      streamMembersCache.set(key, {
        value: next,
        expiresAt: Date.now() + MEMBERS_TTL_MS,
      });
      return next;
    })
    .finally(() => {
      streamMembersInFlight.delete(key);
    });
  streamMembersInFlight.set(key, request);
  return request;
}

export async function loadStreamsSnapshot(
  instanceId: string,
  options?: { force?: boolean },
): Promise<MockStream[]> {
  // Порядок: cache -> in-flight -> сеть -> cache.
  const now = Date.now();
  if (!options?.force) {
    const cached = streamsSnapshotCache.get(instanceId);
    if (isEntryFresh(cached, now)) {
      return [...cached.value];
    }
  }

  const inFlight = streamsSnapshotInFlight.get(instanceId);
  if (inFlight) {
    return inFlight;
  }

  const request = fetchStreams()
    .then((streams) => {
      const next = [...streams];
      streamsSnapshotCache.set(instanceId, {
        value: next,
        expiresAt: Date.now() + STREAMS_TTL_MS,
      });
      return next;
    })
    .finally(() => {
      streamsSnapshotInFlight.delete(instanceId);
    });
  streamsSnapshotInFlight.set(instanceId, request);
  return request;
}

export async function loadStreamMetadata(
  instanceId: string,
  streamId: number,
  options?: { force?: boolean },
): Promise<{ name: string | null; description: string | null }> {
  // Метадату стрима (имя + description) достаем из snapshot списка стримов.
  const streams = await loadStreamsSnapshot(instanceId, options);
  const stream = streams.find((entry) => entry.stream_id === streamId);
  return {
    name: stream?.name ?? null,
    description: stream?.description ?? null,
  };
}

export function invalidateStream(instanceId: string, streamId: number): void {
  // Чистим кэш участников конкретного стрима и snapshot стримов текущего инстанса.
  const key = streamMembersCacheKey(instanceId, streamId);
  streamMembersCache.delete(key);
  streamMembersInFlight.delete(key);
  streamsSnapshotCache.delete(instanceId);
  streamsSnapshotInFlight.delete(instanceId);
}

export function invalidateInstance(instanceId: string): void {
  // Полная инвалидация кэшей инстанса: snapshot + все members-* записи.
  streamsSnapshotCache.delete(instanceId);
  streamsSnapshotInFlight.delete(instanceId);
  for (const key of streamMembersCache.keys()) {
    if (key.startsWith(`${instanceId}:`)) {
      streamMembersCache.delete(key);
    }
  }
  for (const key of streamMembersInFlight.keys()) {
    if (key.startsWith(`${instanceId}:`)) {
      streamMembersInFlight.delete(key);
    }
  }
}

export function resetChatInfoApiCacheForTests(): void {
  // Сброс всех карт только для тестового окружения.
  streamMembersCache.clear();
  streamsSnapshotCache.clear();
  streamMembersInFlight.clear();
  streamsSnapshotInFlight.clear();
}
