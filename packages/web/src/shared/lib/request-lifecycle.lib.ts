// Этот файл нужен для единого lifecycle сетевых запросов в cache-first страницах.
// Что решает:
// 1) Защита от гонок через requestVersion (старый ответ не перетирает новый).
// 2) Dedupe одинаковых in-flight запросов по детерминированному ключу.

const inFlightByKey = new Map<string, Promise<unknown>>();

export interface RequestLifecycleMeta {
  requestVersion: number;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  lastLoadedAt: number | null;
}

export function startRequest(
  currentRequestVersion: number,
  hasCachedData: boolean,
): Pick<RequestLifecycleMeta, "requestVersion" | "isInitialLoading" | "isRefreshing"> {
  // Если уже есть кэш, не блокируем UI loader'ом, показываем мягкий refresh.
  return {
    requestVersion: currentRequestVersion + 1,
    isInitialLoading: !hasCachedData,
    isRefreshing: hasCachedData,
  };
}

export function isActualRequest(currentRequestVersion: number, requestVersion: number): boolean {
  return currentRequestVersion === requestVersion;
}

export function finishRequestSuccess(
  currentRequestVersion: number,
  requestVersion: number,
): Pick<RequestLifecycleMeta, "isInitialLoading" | "isRefreshing" | "lastLoadedAt"> | null {
  // Применяем финал только для актуальной версии запроса.
  if (!isActualRequest(currentRequestVersion, requestVersion)) return null;
  return {
    isInitialLoading: false,
    isRefreshing: false,
    lastLoadedAt: Date.now(),
  };
}

export function finishRequestError(
  currentRequestVersion: number,
  requestVersion: number,
): Pick<RequestLifecycleMeta, "isInitialLoading" | "isRefreshing"> | null {
  // Ошибка старого запроса не должна трогать текущее состояние.
  if (!isActualRequest(currentRequestVersion, requestVersion)) return null;
  return {
    isInitialLoading: false,
    isRefreshing: false,
  };
}

// Склеивает параллельные одинаковые запросы по ключу.
// Первый вызов делает реальный fetch, остальные ждут тот же Promise.
export function runInFlightDeduped<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const inFlight = inFlightByKey.get(key) as Promise<T> | undefined;
  if (inFlight) return inFlight;
  const nextPromise = factory().finally(() => {
    if (inFlightByKey.get(key) === nextPromise) {
      inFlightByKey.delete(key);
    }
  });
  inFlightByKey.set(key, nextPromise);
  return nextPromise;
}
