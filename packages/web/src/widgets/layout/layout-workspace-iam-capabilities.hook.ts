import { useEffect } from "react";
import { ensureFreshWorkspaceSession } from "~/entities/workspace-auth/workspace-auth.lib";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { useWorkspaceIamCapabilitiesStore } from "~/entities/workspace-auth/workspace-iam-capabilities.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import {
  getWorkspaceIamIntrospection,
  WorkspaceIamIntrospectionError,
  type WorkspaceIamIntrospection,
} from "~/shared/api/workspace-iam-introspection.api";
import { isAbortError } from "~/shared/lib/abort-error";
import { onReconnect } from "~/shared/lib/network";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import { onTabResume, onVisibilityChange } from "~/shared/lib/visibility";

export const WORKSPACE_IAM_CAPABILITIES_STALE_MS = 30_000;
const WORKSPACE_IAM_CAPABILITIES_REVALIDATION_DEBOUNCE_MS = 500;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Workspace IAM capabilities request failed";
}

function currentRuntimeForOwner(ownerKey: string): WorkspaceRuntimeContext | null {
  const runtimeContext = useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
  if (runtimeContext == null || workspaceRuntimeOwnerKey(runtimeContext) !== ownerKey) return null;
  return runtimeContext;
}

function validateIntrospectionOwner(
  introspection: WorkspaceIamIntrospection,
  runtimeContext: WorkspaceRuntimeContext,
): void {
  if (
    introspection.projectId !== runtimeContext.projectId ||
    introspection.userInfo.uuid !== runtimeContext.userUuid
  ) {
    throw new TypeError("Workspace IAM introspection owner mismatch");
  }
}

interface LoadedWorkspaceIamCapabilities {
  introspection: WorkspaceIamIntrospection;
  requestRuntime: WorkspaceRuntimeContext;
  requestGeneration: number;
}

async function loadWorkspaceIamCapabilitiesAttempt(options: {
  ownerKey: string;
  accountId: string;
  currentRuntime: WorkspaceRuntimeContext;
  currentRequestGeneration: number;
  signal: AbortSignal;
}): Promise<LoadedWorkspaceIamCapabilities | null> {
  const { ownerKey, accountId, currentRuntime, currentRequestGeneration, signal } = options;
  try {
    const introspection = await getWorkspaceIamIntrospection({
      accessToken: currentRuntime.accessToken,
      baseUrl: currentRuntime.organizationOrigin,
      signal,
    });
    return {
      introspection,
      requestRuntime: currentRuntime,
      requestGeneration: currentRequestGeneration,
    };
  } catch (error) {
    if (!(error instanceof WorkspaceIamIntrospectionError) || error.status !== 401) {
      throw error;
    }
  }

  await ensureFreshWorkspaceSession(accountId, { force: true, signal });
  if (signal.aborted) return null;
  const retryRuntime = currentRuntimeForOwner(ownerKey);
  if (retryRuntime == null) return null;
  const retryRequestGeneration = useWorkspaceIamCapabilitiesStore
    .getState()
    .startLoad(ownerKey, retryRuntime.runtimeGeneration);
  const introspection = await getWorkspaceIamIntrospection({
    accessToken: retryRuntime.accessToken,
    baseUrl: retryRuntime.organizationOrigin,
    signal,
  });
  return {
    introspection,
    requestRuntime: retryRuntime,
    requestGeneration: retryRequestGeneration,
  };
}

export function useLayoutWorkspaceIamCapabilities(
  runtimeContext: WorkspaceRuntimeContext | null,
): void {
  const invalidationVersion = useWorkspaceIamCapabilitiesStore(
    (state) => state.invalidationVersion,
  );
  const ownerKey = runtimeContext == null ? null : workspaceRuntimeOwnerKey(runtimeContext);
  const accountId = runtimeContext?.accountId ?? null;
  const runtimeGeneration = runtimeContext?.runtimeGeneration ?? null;

  useEffect(() => {
    if (ownerKey == null || accountId == null || runtimeGeneration == null) {
      useWorkspaceIamCapabilitiesStore.getState().clear();
      return;
    }

    const controller = new AbortController();
    let inFlight: Promise<void> | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const load = (force: boolean): Promise<void> => {
      if (inFlight != null) return inFlight;
      const state = useWorkspaceIamCapabilitiesStore.getState();
      const isFresh =
        state.ownerKey === ownerKey &&
        state.lastLoadedAtMs != null &&
        Date.now() - state.lastLoadedAtMs < WORKSPACE_IAM_CAPABILITIES_STALE_MS;
      if (!force && isFresh) return Promise.resolve();

      const request = async (): Promise<void> => {
        const initialRequestGeneration = state.startLoad(ownerKey, runtimeGeneration);
        try {
          await ensureFreshWorkspaceSession(accountId, { signal: controller.signal });
          if (controller.signal.aborted) return;

          const currentRuntime = currentRuntimeForOwner(ownerKey);
          if (currentRuntime == null) return;
          const currentRequestGeneration =
            currentRuntime.runtimeGeneration === runtimeGeneration
              ? initialRequestGeneration
              : useWorkspaceIamCapabilitiesStore
                  .getState()
                  .startLoad(ownerKey, currentRuntime.runtimeGeneration);

          const loaded = await loadWorkspaceIamCapabilitiesAttempt({
            ownerKey,
            accountId,
            currentRuntime,
            currentRequestGeneration,
            signal: controller.signal,
          });
          if (controller.signal.aborted || loaded == null) return;
          const latestRuntime = currentRuntimeForOwner(ownerKey);
          if (latestRuntime?.runtimeGeneration !== loaded.requestRuntime.runtimeGeneration) {
            return;
          }
          validateIntrospectionOwner(loaded.introspection, latestRuntime);
          useWorkspaceIamCapabilitiesStore
            .getState()
            .finishLoad(
              ownerKey,
              loaded.requestRuntime.runtimeGeneration,
              loaded.requestGeneration,
              loaded.introspection.permissions,
            );
        } catch (error) {
          if (controller.signal.aborted || isAbortError(error)) return;
          const currentState = useWorkspaceIamCapabilitiesStore.getState();
          if (currentState.ownerKey === ownerKey && currentState.runtimeGeneration != null) {
            currentState.failLoad(
              ownerKey,
              currentState.runtimeGeneration,
              currentState.requestGeneration,
              errorMessage(error),
            );
          }
          reportUnexpectedError("workspace-iam:capabilities", error);
        }
      };

      inFlight = request().finally(() => {
        inFlight = null;
      });
      return inFlight;
    };

    const scheduleRevalidation = (force = false): void => {
      if (debounceTimer != null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void load(force);
      }, WORKSPACE_IAM_CAPABILITIES_REVALIDATION_DEBOUNCE_MS);
    };

    void load(true);
    const unsubscribeResume = onTabResume(() => scheduleRevalidation());
    const unsubscribeVisibility = onVisibilityChange((visible) => {
      if (visible) scheduleRevalidation();
    });
    const unsubscribeReconnect = onReconnect(() => {
      const state = useWorkspaceIamCapabilitiesStore.getState();
      scheduleRevalidation(state.ownerKey === ownerKey && state.status === "error");
    });
    const handleFocus = () => scheduleRevalidation();
    window.addEventListener("focus", handleFocus);

    return () => {
      controller.abort();
      unsubscribeResume();
      unsubscribeVisibility();
      unsubscribeReconnect();
      window.removeEventListener("focus", handleFocus);
      if (debounceTimer != null) clearTimeout(debounceTimer);
    };
  }, [accountId, invalidationVersion, ownerKey, runtimeGeneration]);
}
