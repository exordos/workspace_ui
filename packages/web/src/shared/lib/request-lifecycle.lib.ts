/**
 * Shared request lifecycle for cache-first pages: version guards and in-flight dedupe.
 */
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
  if (!isActualRequest(currentRequestVersion, requestVersion)) return null;
  return {
    isInitialLoading: false,
    isRefreshing: false,
  };
}

/** Coalesces parallel identical requests: first caller fetches, others await the same Promise. */
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
