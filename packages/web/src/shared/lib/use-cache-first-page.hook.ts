/**
 * Shared cache-first page load: hydrate from cache, then deduped network refresh.
 */
import { useEffect, useRef } from "react";
import {
  captureActiveOrgRequestContext,
  isActiveOrgRequestContextCurrent,
  type ActiveOrgRequestContext,
} from "~/entities/instance/instance.model";
import { runInFlightDeduped } from "~/shared/lib/request-lifecycle.lib";

interface CacheFirstPageRunContext {
  instanceId: string;
  orgContext: ActiveOrgRequestContext;
  signal: AbortSignal;
}

export interface UseCacheFirstPageLoadConfig {
  instanceId: string | null;
  /** Dedupe key for `runInFlightDeduped` (include instance + resource). */
  dedupeKey: string;
  /** Increment to re-run hydrate + network refresh (e.g. inbox/activity stale signals). */
  refreshVersion?: number;
  onInstanceChange?: (instanceId: string) => void;
  hydrate: (context: CacheFirstPageRunContext) => Promise<void>;
  hasCachedData: () => boolean;
  startRequest: (hasCachedData: boolean) => number;
  fetch: (context: CacheFirstPageRunContext & { requestVersion: number }) => Promise<void>;
  onFetchError?: (error: unknown, requestVersion: number) => void;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function useCacheFirstPageLoad(config: UseCacheFirstPageLoadConfig): void {
  const configRef = useRef(config);

  useEffect(() => {
    configRef.current = config;
  });

  useEffect(() => {
    const { instanceId, dedupeKey } = configRef.current;

    if (instanceId == null) return;

    const orgContext = captureActiveOrgRequestContext();
    const controller = new AbortController();
    const runContext: CacheFirstPageRunContext = {
      instanceId,
      orgContext,
      signal: controller.signal,
    };
    configRef.current.onInstanceChange?.(instanceId);

    void (async () => {
      try {
        await configRef.current.hydrate(runContext);
      } catch (error) {
        if (
          isAbortError(error) ||
          controller.signal.aborted ||
          !isActiveOrgRequestContextCurrent(orgContext)
        ) {
          return;
        }
      }

      if (controller.signal.aborted || !isActiveOrgRequestContextCurrent(orgContext)) return;

      const requestVersion = configRef.current.startRequest(configRef.current.hasCachedData());
      try {
        await runInFlightDeduped(dedupeKey, () =>
          configRef.current.fetch({ ...runContext, requestVersion }),
        );
      } catch (error) {
        if (
          isAbortError(error) ||
          controller.signal.aborted ||
          !isActiveOrgRequestContextCurrent(orgContext)
        ) {
          return;
        }
        configRef.current.onFetchError?.(error, requestVersion);
      }
    })();

    return () => {
      controller.abort();
    };
  }, [config.instanceId, config.dedupeKey, config.refreshVersion ?? 0]);
}
