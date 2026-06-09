/**
 * Shared cache-first page load: hydrate from cache, then deduped network refresh.
 */
import { useEffect, useRef } from "react";
import { runInFlightDeduped } from "~/shared/lib/request-lifecycle.lib";

export interface UseCacheFirstPageLoadConfig {
  instanceId: string | null;
  /** Dedupe key for `runInFlightDeduped` (include instance + resource). */
  dedupeKey: string;
  /** Increment to re-run hydrate + network refresh (e.g. inbox/activity stale signals). */
  refreshVersion?: number;
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
    const { instanceId, dedupeKey } = configRef.current;

    if (instanceId == null) return;

    let cancelled = false;
    configRef.current.onInstanceChange?.(instanceId);

    void (async () => {
      await configRef.current.hydrate(instanceId);
      if (cancelled) return;

      const requestVersion = configRef.current.startRequest(configRef.current.hasCachedData());
      try {
        await runInFlightDeduped(dedupeKey, () =>
          configRef.current.fetch(instanceId, requestVersion),
        );
      } catch (error) {
        if (!cancelled) {
          configRef.current.onFetchError?.(error, requestVersion);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [config.instanceId, config.dedupeKey, config.refreshVersion ?? 0]);
}
