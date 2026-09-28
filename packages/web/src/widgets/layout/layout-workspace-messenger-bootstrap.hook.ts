import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useActivityStore } from "~/entities/activity/activity.model";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import { bootstrapMessengerStore } from "~/entities/messenger/messenger-bootstrap.lib";
import { buildWorkspaceRequestOptions } from "~/entities/messenger/messenger-request-options.lib";
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
import {
  isWorkspaceRuntimeRequestContextCurrent,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { useWorkspaceJitsiSettingsStore } from "~/features/jitsi-call/jitsi-call-settings.model";
import { getEpoch } from "~/shared/api/workspace-client";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import type { WorkspaceRealtimeCursor } from "~/shared/lib/workspace-realtime/workspace-realtime-cursor.lib";

export interface LayoutWorkspaceBootstrapBoundary {
  runtimeContext: WorkspaceRuntimeContext;
  cursor: WorkspaceRealtimeCursor;
  signal: AbortSignal;
}

// Layout owns the temporary messenger bootstrap until a dedicated process layer exists.
const WORKSPACE_BOOTSTRAP_REFRESH_RETRY_DELAY_MS = 5_000;
const WORKSPACE_BOOTSTRAP_CATALOG_RETRY_LIMIT = 2;

function hasWorkspaceAuthSession(accountId: string): boolean {
  return useWorkspaceAuthStore
    .getState()
    .sessions.some((session) => session.accountId === accountId);
}

function shouldRetryWorkspaceAuthRefreshError(error: unknown): boolean {
  const failure = classifyWorkspaceAuthRefreshError(error);
  return failure.reason !== "owner-mismatch";
}

export function useLayoutWorkspaceMessengerBootstrap(options: {
  enabled: boolean;
  retryNonce?: number;
}): LayoutWorkspaceBootstrapBoundary | null {
  const { enabled, retryNonce = 0 } = options;
  const sessions = useWorkspaceAuthStore((state) => state.sessions);
  const currentAccountId = useWorkspaceAuthStore((state) => state.currentAccountId);
  const runtimeContext = useMemo(
    () => selectCurrentWorkspaceRuntimeContext({ sessions, currentAccountId }),
    [sessions, currentAccountId],
  );
  const clearMessengerStore = useMessengerStore((state) => state.clear);
  const setWorkspaceMessageOwner = useWorkspaceMessageStore((state) => state.setOwner);
  const runtimeOwnerKey = runtimeContext == null ? null : workspaceRuntimeOwnerKey(runtimeContext);
  const attempt = useMemo(
    () => ({ runtimeContext, enabled, retryNonce }),
    [runtimeContext, enabled, retryNonce],
  );
  const [completed, setCompleted] = useState<{
    attempt: typeof attempt;
    boundary: LayoutWorkspaceBootstrapBoundary;
  } | null>(null);

  useLayoutEffect(() => {
    const messageState = useWorkspaceMessageStore.getState();
    const canPreserveWarmWindow =
      messageState.ownerKey == null &&
      runtimeOwnerKey != null &&
      useMessengerStore.getState().ownerKey === runtimeOwnerKey;
    setWorkspaceMessageOwner(runtimeOwnerKey, canPreserveWarmWindow);
  }, [runtimeOwnerKey, setWorkspaceMessageOwner]);

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
    let catalogRetryAttempts = 0;

    const scheduleRetry = (): void => {
      if (controller.signal.aborted || retryTimer != null) return;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void startBootstrap();
      }, WORKSPACE_BOOTSTRAP_REFRESH_RETRY_DELAY_MS);
    };
    const retryFailedBootstrap = (): void => {
      if (
        !controller.signal.aborted &&
        hasWorkspaceAuthSession(runtimeContext.accountId) &&
        catalogRetryAttempts < WORKSPACE_BOOTSTRAP_CATALOG_RETRY_LIMIT
      ) {
        catalogRetryAttempts += 1;
        scheduleRetry();
      }
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
      if (
        latestRuntimeContext == null ||
        !isWorkspaceRuntimeRequestContextCurrent(runtimeContext, () => latestRuntimeContext)
      ) {
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

      const isCurrent = (): boolean =>
        !controller.signal.aborted &&
        isWorkspaceRuntimeRequestContextCurrent(
          latestRuntimeContext,
          useWorkspaceAuthStore.getState().getCurrentRuntimeContext,
        );
      try {
        let cursor: WorkspaceRealtimeCursor | null = null;
        const result = await bootstrapMessengerStore({
          runtimeContext: latestRuntimeContext,
          getRuntimeContext: () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
          signal: controller.signal,
          requireCompleteSnapshot: true,
          beforeServerRefresh: async () => {
            // Cache can render immediately; the boundary must precede fresh snapshot reads.
            const epoch = await getEpoch(
              buildWorkspaceRequestOptions(latestRuntimeContext, undefined, controller.signal),
            );
            cursor = {
              epochGeneration: epoch.epoch_generation,
              epochVersion: epoch.epoch_version,
            };
          },
        });
        if (!isCurrent()) return;
        if (
          result?.status === "applied" &&
          result.ownerKey === settingsOwnerKey &&
          cursor != null
        ) {
          useActivityStore.getState().invalidateUnreadMentions(settingsOwnerKey);
          setCompleted({
            attempt,
            boundary: {
              runtimeContext: latestRuntimeContext,
              cursor,
              signal: controller.signal,
            },
          });
        } else if (result?.status === "failed") {
          retryFailedBootstrap();
        }
      } catch (error) {
        if (!isCurrent()) return;
        const store = useMessengerStore.getState();
        store.startBootstrap(settingsOwnerKey);
        store.setBootstrapError(
          settingsOwnerKey,
          error instanceof Error ? error.message : "Messenger bootstrap failed",
        );
        reportUnexpectedError("workspace-messenger:bootstrap", error);
        retryFailedBootstrap();
      }
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
  }, [attempt, clearMessengerStore, enabled, runtimeContext]);

  // The attempt identity closes the render-to-effect gap on owner changes and manual retries.
  return completed?.attempt === attempt && !completed.boundary.signal.aborted
    ? completed.boundary
    : null;
}
