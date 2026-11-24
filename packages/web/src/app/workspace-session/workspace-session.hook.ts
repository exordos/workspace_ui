import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import {
  clearActiveMessengerSession,
  prepareActiveMessengerSession,
} from "~/applications/messenger/runtime/sync/messenger-session-snapshot.lib";
import { clearActiveWorkspaceSessionUsers } from "~/entities/user/user-sync.lib";
import { useUsersStore } from "~/entities/user/user.model";
import { fetchWorkspaceServerSettingsForOrganization } from "~/entities/workspace-auth/workspace-auth.lib";
import {
  useWorkspaceAuthStore,
  type WorkspaceAuthSession,
} from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { useWorkspaceJitsiSettingsStore } from "~/features/jitsi-call/jitsi-call-settings.model";
import { onPowerResume } from "~/shared/lib/power";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import { createWorkspaceRealtimeBrowserCursorStorage } from "~/shared/lib/workspace-realtime/workspace-realtime-cursor.lib";
import { readWorkspaceSession } from "./workspace-session-bootstrap.lib";
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
  const activeOwnerKey = activeSession == null ? null : workspaceRuntimeOwnerKey(activeSession);
  const canReportPresence = useUsersStore(
    (state) =>
      activeSession != null &&
      state.ownerKey === activeOwnerKey &&
      state.usersById[activeSession.userUuid] != null,
  );

  useLayoutEffect(() => {
    if (!enabled) return;
    if (activeSession == null) {
      clearActiveMessengerSession();
      clearActiveWorkspaceSessionUsers();
      return;
    }

    // History and route actions can run as soon as the screen mounts.
    prepareActiveMessengerSession({
      runtimeContext: activeSession,
      getRuntimeContext: () => readWorkspaceSession(activeSession, "active"),
      surface: "active",
    });
  }, [activeSession, enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    const unsubscribe = onPowerResume(() => {
      void manager.current?.reconnectAll("power_resume").catch((error) => {
        reportUnexpectedError("workspace-realtime:resume", error);
      });
    });
    return () => {
      unsubscribe();
      const current = manager.current;
      manager.current = null;
      void current?.stopAll("workspace_session_cleanup").catch((error) => {
        reportUnexpectedError("workspace-realtime:stop", error);
      });
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (manager.current == null && sessions.length > 0) {
      manager.current = createWorkspaceSessionRuntimeManager(
        createWorkspaceRealtimeBrowserCursorStorage(),
      );
    }
    void manager.current
      ?.update(sessions.map(toWorkspaceSessionContext), activeOwnerKey)
      .catch((error) => {
        reportUnexpectedError("workspace-realtime:start", error);
      });
  }, [activeOwnerKey, enabled, sessions]);

  useEffect(() => {
    if (!enabled || activeSession == null || !canReportPresence) return undefined;
    return startWorkspaceSessionPresence(activeSession);
  }, [activeSession, canReportPresence, enabled]);

  useEffect(() => {
    if (!enabled || activeSession == null || activeOwnerKey == null) return undefined;
    const controller = new AbortController();
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
    return () => controller.abort();
  }, [activeOwnerKey, activeSession, enabled]);

  return useCallback(() => {
    const runtimeContext = useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
    if (runtimeContext == null) return;
    void manager.current?.restartOwner(workspaceRuntimeOwnerKey(runtimeContext)).catch((error) => {
      reportUnexpectedError("workspace-realtime:retry", error);
    });
  }, []);
}
