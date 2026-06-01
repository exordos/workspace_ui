/**
 * Shared cache-first page load: hydrate from cache, then deduped network refresh.
 */
import { useEffect, useRef } from "react";
import { runInFlightDeduped } from "~/shared/lib/request-lifecycle.lib";

export interface UseCacheFirstPageLoadConfig {
  instanceId: string | null;
  /** Dedupe key for `runInFlightDeduped` (include instance + resource). */
  dedupeKey: string;
  onInstanceChange?: (instanceId: string) => void;
  hydrate: (instanceId: string) => Promise<void>;
  hasCachedData: () => boolean;
  startRequest: (hasCachedData: boolean) => number;
  fetch: (instanceId: string, requestVersion: number) => Promise<void>;
  onFetchError?: (error: unknown, requestVersion: number) => void;
}

export function useCacheFirstPageLoad(config: UseCacheFirstPageLoadConfig): void {
  const configRef = useRef(config);

  useEffect(() => {
    configRef.current = config;
  });

  useEffect(() => {
    const {
      instanceId,
      dedupeKey,
      onInstanceChange,
      hydrate,
      hasCachedData,
      startRequest,
      fetch,
      onFetchError,
    } = configRef.current;

    if (instanceId == null) return;

    let cancelled = false;
    onInstanceChange?.(instanceId);

    void (async () => {
      await hydrate(instanceId);
      if (cancelled) return;

      const requestVersion = startRequest(hasCachedData());
      try {
        await runInFlightDeduped(dedupeKey, () => fetch(instanceId, requestVersion));
      } catch (error) {
        if (!cancelled) {
          onFetchError?.(error, requestVersion);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [config.instanceId, config.dedupeKey]);
}
