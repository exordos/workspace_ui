import { useEffect, useMemo } from "react";
import { bootstrapMessengerStore } from "~/entities/messenger/messenger-bootstrap.lib";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import {
  refreshWorkspaceSession,
  shouldRefreshWorkspaceSession,
} from "~/entities/workspace-auth/workspace-auth.lib";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";

// Layout owns the temporary messenger bootstrap until a dedicated process layer exists.
export function useLayoutWorkspaceMessengerBootstrap(): void {
  const sessions = useWorkspaceAuthStore((state) => state.sessions);
  const currentAccountId = useWorkspaceAuthStore((state) => state.currentAccountId);
  const runtimeContext = useMemo(
    () => selectCurrentWorkspaceRuntimeContext({ sessions, currentAccountId }),
    [sessions, currentAccountId],
  );
  const clearMessengerStore = useMessengerStore((state) => state.clear);

  useEffect(() => {
    if (runtimeContext == null) {
      clearMessengerStore();
      return;
    }

    const controller = new AbortController();
    const session = useWorkspaceAuthStore
      .getState()
      .sessions.find((item) => item.accountId === runtimeContext.accountId);

    if (session != null && shouldRefreshWorkspaceSession(session)) {
      void refreshWorkspaceSession(runtimeContext.accountId).catch((error) => {
        reportUnexpectedError("workspace-auth:refresh", error);
      });
      return () => {
        controller.abort();
      };
    }

    void bootstrapMessengerStore({
      runtimeContext,
      getRuntimeContext: () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
      clientOptions: { devTargetOrigin: session?.organizationOrigin },
      signal: controller.signal,
    }).catch((error) => {
      reportUnexpectedError("workspace-messenger:bootstrap", error);
    });

    return () => {
      controller.abort();
    };
  }, [clearMessengerStore, runtimeContext]);
}
