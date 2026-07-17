/**
 * Shared cache-first page load: hydrate from cache, then deduped network refresh.
 */
import { useEffect, useRef } from "react";
import {
  captureWorkspaceRuntimeRequestContext,
  isWorkspaceRuntimeRequestContextCurrent,
  type WorkspaceRuntimeContextGetter,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeRequestContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { runInFlightDeduped } from "~/shared/lib/request-lifecycle.lib";

interface CacheFirstPageRunContext {
  instanceId: string;
  requestContext: WorkspaceRuntimeRequestContext;
  signal: AbortSignal;
}

export interface UseCacheFirstPageLoadConfig {
  instanceId: string | null;
  getRuntimeContext: WorkspaceRuntimeContextGetter;
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

    const requestContext = captureWorkspaceRuntimeRequestContext(
      configRef.current.getRuntimeContext,
    );
    if (requestContext == null) return;

    const controller = new AbortController();
    const runContext: CacheFirstPageRunContext = {
      instanceId,
      requestContext,
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
          !isWorkspaceRuntimeRequestContextCurrent(
            requestContext,
            configRef.current.getRuntimeContext,
          )
        ) {
          return;
        }
      }

      if (
        controller.signal.aborted ||
        !isWorkspaceRuntimeRequestContextCurrent(
          requestContext,
          configRef.current.getRuntimeContext,
        )
      ) {
        return;
      }

      const requestVersion = configRef.current.startRequest(configRef.current.hasCachedData());
      try {
        await runInFlightDeduped(dedupeKey, () =>
          configRef.current.fetch({ ...runContext, requestVersion }),
        );
      } catch (error) {
        if (
          isAbortError(error) ||
          controller.signal.aborted ||
          !isWorkspaceRuntimeRequestContextCurrent(
            requestContext,
            configRef.current.getRuntimeContext,
          )
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
