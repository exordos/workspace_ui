import { useEffect, useMemo } from "react";
import { bootstrapMessengerStore } from "~/entities/messenger/messenger-bootstrap.lib";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import {
  classifyWorkspaceAuthRefreshError,
  ensureFreshWorkspaceSession,
  fetchWorkspaceServerSettingsForOrganization,
} from "~/entities/workspace-auth/workspace-auth.lib";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { useWorkspaceJitsiSettingsStore } from "~/features/jitsi-call/jitsi-call-settings.model";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";

// Layout owns the temporary messenger bootstrap until a dedicated process layer exists.
const WORKSPACE_BOOTSTRAP_REFRESH_RETRY_DELAY_MS = 5_000;

function hasWorkspaceAuthSession(accountId: string): boolean {
  return useWorkspaceAuthStore
    .getState()
    .sessions.some((session) => session.accountId === accountId);
}

function shouldRetryWorkspaceAuthRefreshError(error: unknown): boolean {
  const failure = classifyWorkspaceAuthRefreshError(error);
  return failure.reason !== "owner-mismatch";
}

export function useLayoutWorkspaceMessengerBootstrap(options: { enabled: boolean }): void {
  const { enabled } = options;
  const sessions = useWorkspaceAuthStore((state) => state.sessions);
  const currentAccountId = useWorkspaceAuthStore((state) => state.currentAccountId);
  const runtimeContext = useMemo(
    () => selectCurrentWorkspaceRuntimeContext({ sessions, currentAccountId }),
    [sessions, currentAccountId],
  );
  const clearMessengerStore = useMessengerStore((state) => state.clear);

  useEffect(() => {
    if (!enabled) {
      clearMessengerStore();
      return;
    }

    if (runtimeContext == null) {
      clearMessengerStore();
      return;
    }

    const controller = new AbortController();
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRetry = (): void => {
      if (controller.signal.aborted || retryTimer != null) return;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void startBootstrap();
      }, WORKSPACE_BOOTSTRAP_REFRESH_RETRY_DELAY_MS);
    };

    const startBootstrap = async (): Promise<void> => {
      try {
        await ensureFreshWorkspaceSession(runtimeContext.accountId, {
          signal: controller.signal,
        });
      } catch (error) {
        if (controller.signal.aborted || !hasWorkspaceAuthSession(runtimeContext.accountId)) {
          return;
        }
        reportUnexpectedError("workspace-auth:refresh", error);
        if (shouldRetryWorkspaceAuthRefreshError(error)) {
          scheduleRetry();
        }
        return;
      }

      if (controller.signal.aborted) {
        return;
      }

      const latestRuntimeContext = useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
      if (latestRuntimeContext?.accountId !== runtimeContext.accountId) {
        return;
      }

      const settingsOwnerKey = workspaceRuntimeOwnerKey(latestRuntimeContext);
      void fetchWorkspaceServerSettingsForOrganization(latestRuntimeContext.organizationOrigin, {
        signal: controller.signal,
      })
        .then((serverSettings) => {
          if (controller.signal.aborted) return;
          const currentRuntimeContext = useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
          if (currentRuntimeContext?.accountId !== latestRuntimeContext.accountId) return;
          useWorkspaceJitsiSettingsStore
            .getState()
            .setWorkspaceMeetUrl(settingsOwnerKey, serverSettings.meet_url);
        })
        .catch((error) => {
          if (!controller.signal.aborted) {
            reportUnexpectedError("workspace-jitsi:server-settings", error);
          }
        });

      await bootstrapMessengerStore({
        runtimeContext: latestRuntimeContext,
        getRuntimeContext: () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
        signal: controller.signal,
      });
    };

    void startBootstrap().catch((error) => {
      if (!controller.signal.aborted) {
        reportUnexpectedError("workspace-messenger:bootstrap", error);
      }
    });

    return () => {
      controller.abort();
      if (retryTimer != null) {
        clearTimeout(retryTimer);
      }
    };
  }, [clearMessengerStore, enabled, runtimeContext]);
}
