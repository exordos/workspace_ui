// Файл с централизованной политикой загрузки статуса пользователей.
// Простыми словами: сюда попадает любая попытка "подгрузить статус",
// а дальше мы уже сами решаем:
// - можно ли сейчас идти в сеть (TTL/backoff),
// - не летит ли уже такой же запрос (dedup),
// - в каком порядке запускать запросы (очередь + приоритет),
// - как записать результат/ошибку в store.

import { getCurrentInstance } from "~/shared/api/client";
import { getUserStatusCacheRow, putUserStatusCacheRow } from "~/shared/lib/user-status-cache-db";
import { useUsersStore, type UserRecord } from "../user.model";
import type {
  FetchUserStatusDetailed,
  RequestUserStatusOptions,
  StatusFetchOutcome,
  UserStatusRequestReason,
} from "./user.api.types";

/** Success response considered fresh for this long (default); DM header uses 1 min. */
function getSuccessTtlMs(reason: UserStatusRequestReason | undefined): number {
  if (reason === "dm_header") return 60_000;
  return 5 * 60_000;
}
// После 400 (невалидный пользователь) долго не повторяем запрос.
// Это и есть negative cache.
const STATUS_INVALID_USER_BACKOFF_MS = 24 * 60 * 60_000;
// Для временной ошибки ставим короткий backoff и пробуем позже.
const STATUS_TRANSIENT_ERROR_RETRY_MS = 5 * 60_000;
// Сколько запросов к статусам можно выполнять одновременно.
const STATUS_MAX_CONCURRENT_REQUESTS = 2;

// Карта in-flight запросов:
// key = instanceId:userId, value = Promise текущего запроса.
// Нужна, чтобы не запускать дубликаты параллельно.
const statusRequestCache = new Map<string, Promise<void>>();

// Внутренняя структура одной задачи в очереди.
interface StatusQueueItem {
  // Тот же ключ, что и в statusRequestCache.
  key: string;
  // Какому пользователю грузим статус.
  userId: number;
  // Резолвим промис, когда задача завершилась успешно.
  resolve: () => void;
  // Реджектим промис, если внутри была ошибка выполнения.
  reject: (error: unknown) => void;
}

// Две очереди: важные задачи и фоновые.
const highPriorityQueue: StatusQueueItem[] = [];
const lowPriorityQueue: StatusQueueItem[] = [];
// Счетчик, сколько задач сейчас выполняется.
let activeStatusRequests = 0;

// Собираем ключ запроса с учетом инстанса, чтобы не смешивать данные
// между разными организациями в мульти-аккаунт режиме.
function getStatusRequestKey(userId: number): string {
  const instanceId = getCurrentInstance()?.id ?? "no-instance";
  return `${instanceId}:${userId}`;
}

// Решаем, можно ли пропустить запрос прямо сейчас.
// Возвращает true, если:
// - действует backoff после ошибки
// - или статус еще свежий по TTL
// force=true отключает эти ограничения.
function shouldSkipRequest(
  user: UserRecord,
  now: number,
  options: RequestUserStatusOptions | undefined,
): boolean {
  if (options?.force === true) {
    return false;
  }
  if (user.statusNextRetryAt != null && now < user.statusNextRetryAt) {
    return true;
  }
  const ttl = getSuccessTtlMs(options?.reason);
  return user.statusFetchedAt != null && now - user.statusFetchedAt < ttl;
}

// Кладем задачу в нужную очередь по приоритету.
function enqueueStatusRequest(item: StatusQueueItem, options: RequestUserStatusOptions): void {
  if (options.priority === "high") {
    highPriorityQueue.push(item);
    return;
  }
  lowPriorityQueue.push(item);
}

// Берем следующую задачу:
// сначала high-priority, потом low-priority.
function nextStatusRequestItem(): StatusQueueItem | undefined {
  return highPriorityQueue.shift() ?? lowPriorityQueue.shift();
}

// Записываем результат запроса в store:
// - успех => статус готов
// - invalid_user => длинный backoff
// - transient_error => короткий retry backoff
function applyFetchOutcome(userId: number, outcome: StatusFetchOutcome): void {
  if (outcome.kind === "ok") {
    const fetchedAt = Date.now();
    useUsersStore.getState().setStatus(userId, outcome.status, fetchedAt);
    const inst = getCurrentInstance();
    if (inst?.id) {
      void putUserStatusCacheRow({
        instanceId: inst.id,
        userId,
        status: outcome.status,
        fetchedAt,
      });
    }
    return;
  }
  if (outcome.kind === "invalid_user") {
    useUsersStore.getState().setStatusFetchMeta(userId, {
      fetchState: "invalid_user",
      errorKind: "invalid_user",
      nextRetryAt: Date.now() + STATUS_INVALID_USER_BACKOFF_MS,
      fetchedAt: Date.now(),
    });
    return;
  }
  useUsersStore.getState().setStatusFetchMeta(userId, {
    fetchState: "error",
    errorKind: "transient",
    nextRetryAt: Date.now() + STATUS_TRANSIENT_ERROR_RETRY_MS,
    fetchedAt: Date.now(),
  });
}

// Запасная ветка для исключений (например, throw в fetch-функции).
// Считаем это временной ошибкой и ставим retry окно.
function applyTransientFailure(userId: number): void {
  useUsersStore.getState().setStatusFetchMeta(userId, {
    fetchState: "error",
    errorKind: "transient",
    nextRetryAt: Date.now() + STATUS_TRANSIENT_ERROR_RETRY_MS,
    fetchedAt: Date.now(),
  });
}

// Обрабатывает одну задачу из очереди:
// 1) ставим loading
// 2) выполняем реальный сетевой fetch
// 3) применяем итог в store
// 4) чистим in-flight cache и освобождаем слот параллелизма
async function processStatusQueueItem(
  item: StatusQueueItem,
  fetchUserStatusDetailed: FetchUserStatusDetailed,
): Promise<void> {
  useUsersStore.getState().setStatusFetchMeta(item.userId, {
    fetchState: "loading",
    fetchedAt: Date.now(),
  });

  try {
    const outcome = await fetchUserStatusDetailed(item.userId);
    applyFetchOutcome(item.userId, outcome);
    item.resolve();
  } catch (error) {
    applyTransientFailure(item.userId);
    item.reject(error);
  } finally {
    statusRequestCache.delete(item.key);
    activeStatusRequests = Math.max(0, activeStatusRequests - 1);
  }
}

// "Двигатель" очереди.
// Пока есть свободные слоты по параллелизму, запускаем следующие задачи.
function pumpStatusRequestQueue(fetchUserStatusDetailed: FetchUserStatusDetailed): void {
  while (activeStatusRequests < STATUS_MAX_CONCURRENT_REQUESTS) {
    const nextItem = nextStatusRequestItem();
    if (!nextItem) {
      return;
    }
    activeStatusRequests += 1;
    void processStatusQueueItem(nextItem, fetchUserStatusDetailed).finally(() => {
      pumpStatusRequestQueue(fetchUserStatusDetailed);
    });
  }
}

// Главная публичная функция оркестратора.
// Это единая точка, через которую надо запрашивать fallback-статус.
// Здесь собрана вся политика: валидация -> skip -> dedup -> queue.
export async function requestUserStatusWithPolicy(
  userId: number,
  options: RequestUserStatusOptions | undefined,
  fetchUserStatusDetailed: FetchUserStatusDetailed,
): Promise<void> {
  // Защита от невалидного id.
  if (!Number.isFinite(userId) || userId <= 0) {
    return;
  }

  // Без активного инстанса сеть не дергаем.
  const instance = getCurrentInstance();
  if (!instance?.realm || !instance.email || !instance.apiKey) {
    return;
  }

  // Фоллбек работает только для пользователей, которые уже есть в store.
  let user = useUsersStore.getState().getUser(userId);
  if (!user) {
    return;
  }

  const normalizedOptions: RequestUserStatusOptions = {
    ...options,
    reason: options?.reason ?? "compat",
    priority: options?.priority ?? "low",
  };

  if (user.statusFetchedAt == null && instance.id) {
    const row = await getUserStatusCacheRow(instance.id, userId);
    if (row != null) {
      useUsersStore.getState().setStatus(userId, row.status, row.fetchedAt);
      user = useUsersStore.getState().getUser(userId);
      if (!user) {
        return;
      }
    }
  }

  const now = Date.now();
  if (shouldSkipRequest(user, now, normalizedOptions)) {
    return;
  }

  // Если такой же запрос уже выполняется, просто ждем его.
  const key = getStatusRequestKey(userId);
  const inFlight = statusRequestCache.get(key);
  if (inFlight) {
    await inFlight;
    return;
  }

  const promise = new Promise<void>((resolve, reject) => {
    enqueueStatusRequest({ key, userId, resolve, reject }, normalizedOptions);
    pumpStatusRequestQueue(fetchUserStatusDetailed);
  });

  // Регистрируем in-flight, чтобы дубликаты не ушли в сеть.
  statusRequestCache.set(key, promise);
  await promise;
}
