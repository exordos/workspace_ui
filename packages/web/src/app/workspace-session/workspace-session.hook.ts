import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import {
  reconcileMessengerSessionModels,
  releaseMessengerSessionProjections,
} from "~/applications/messenger/runtime/sync/messenger-session-snapshot.lib";
import { reconcileUsersSessions, useHasUserForOwner } from "~/entities/user/users-runtime";
import { fetchWorkspaceServerSettingsForOrganization } from "~/entities/workspace-auth/workspace-auth.lib";
import {
  useWorkspaceAuthStore,
  workspaceAuthSessionIncarnation,
  type WorkspaceAuthSession,
} from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { useWorkspaceJitsiSettingsStore } from "~/features/jitsi-call/jitsi-call-settings.model";
import { onPowerResume } from "~/shared/lib/power";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import { createWorkspaceRealtimeBrowserCursorStorage } from "~/shared/lib/workspace-realtime/workspace-realtime-cursor.lib";
import { readWorkspaceSession } from "./workspace-session-bootstrap.lib";
import { registerWorkspaceColdStartStopper } from "./workspace-session-reset.lib";
import {
  createWorkspaceSessionRuntimeManager,
  startWorkspaceSessionPresence,
  toWorkspaceSessionContext,
} from "./workspace-session.lib";

// Keep the runtime mounted in the app regardless of which Workspace screen is selected.
export function useWorkspaceSessionRuntime(
  sessions: readonly WorkspaceAuthSession[],
  activeSession: WorkspaceAuthSession | null,
  enabled: boolean,
): () => void {
  const manager = useRef<ReturnType<typeof createWorkspaceSessionRuntimeManager> | null>(null);
  const cursorStorage = useRef<ReturnType<
    typeof createWorkspaceRealtimeBrowserCursorStorage
  > | null>(null);
  const previousSessions = useRef(new Map<string, WorkspaceAuthSession>());
  const activeOwnerKey = activeSession == null ? null : workspaceRuntimeOwnerKey(activeSession);
  const canReportPresence = useHasUserForOwner(activeSession?.userUuid, activeOwnerKey);

  useLayoutEffect(() => {
    if (!enabled) return;
    cursorStorage.current ??= createWorkspaceRealtimeBrowserCursorStorage();
    const currentSessions = new Map(
      sessions.map((session) => [workspaceRuntimeOwnerKey(session), session]),
    );
    for (const [ownerKey, previous] of previousSessions.current) {
      const current = currentSessions.get(ownerKey);
      if (
        current != null &&
        workspaceAuthSessionIncarnation(current) === workspaceAuthSessionIncarnation(previous)
      )
        continue;
      cursorStorage.current.clear(previous);
      releaseMessengerSessionProjections(ownerKey);
    }
    previousSessions.current = currentSessions;
    reconcileMessengerSessionModels(sessions);
    reconcileUsersSessions(sessions);
  }, [enabled, sessions]);

  useEffect(() => {
    if (!enabled) return undefined;
    const stopManager = (reason: string) => {
      const current = manager.current;
      manager.current = null;
      void current?.stopAll(reason).catch((error) => {
        reportUnexpectedError("workspace-realtime:stop", error);
      });
    };
    const unregister = registerWorkspaceColdStartStopper(() => stopManager("workspace_cold_start"));
    const unsubscribe = onPowerResume(() => {
      void manager.current?.reconnectAll("power_resume").catch((error) => {
        reportUnexpectedError("workspace-realtime:resume", error);
      });
    });
    return () => {
      unregister();
      unsubscribe();
      stopManager("workspace_session_cleanup");
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || useWorkspaceAuthStore.getState().runtimeSuspended) return;
    if (manager.current == null && sessions.length > 0 && cursorStorage.current != null) {
      manager.current = createWorkspaceSessionRuntimeManager(cursorStorage.current);
    }
    void manager.current
      ?.update(sessions.map(toWorkspaceSessionContext), activeOwnerKey)
      .catch((error) => {
        reportUnexpectedError("workspace-realtime:start", error);
      });
  }, [activeOwnerKey, enabled, sessions]);

  useEffect(() => {
    if (
      !enabled ||
      activeSession == null ||
      !canReportPresence ||
      useWorkspaceAuthStore.getState().runtimeSuspended
    )
      return undefined;
    const stopPresence = startWorkspaceSessionPresence(activeSession);
    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      unregister();
      stopPresence();
    };
    const unregister = registerWorkspaceColdStartStopper(stop);
    return stop;
  }, [activeSession, canReportPresence, enabled]);

  useEffect(() => {
    if (
      !enabled ||
      activeSession == null ||
      activeOwnerKey == null ||
      useWorkspaceAuthStore.getState().runtimeSuspended
    )
      return undefined;
    const controller = new AbortController();
    const unregister = registerWorkspaceColdStartStopper(() => controller.abort());
    void fetchWorkspaceServerSettingsForOrganization(activeSession.organizationOrigin, {
      signal: controller.signal,
    })
      .then(({ meet_url }) => {
        if (controller.signal.aborted || readWorkspaceSession(activeSession, "active") == null)
          return;
        useWorkspaceJitsiSettingsStore.getState().setWorkspaceMeetUrl(activeOwnerKey, meet_url);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          reportUnexpectedError("workspace-jitsi:server-settings", error);
      });
    return () => {
      unregister();
      controller.abort();
    };
  }, [activeOwnerKey, activeSession, enabled]);

  return useCallback(() => {
    const runtimeContext = useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
    if (runtimeContext == null) return;
    void manager.current?.restartOwner(workspaceRuntimeOwnerKey(runtimeContext)).catch((error) => {
      reportUnexpectedError("workspace-realtime:retry", error);
    });
  }, []);
}
