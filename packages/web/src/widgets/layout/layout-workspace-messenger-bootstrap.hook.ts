import { useEffect } from "react";
import { bootstrapMessengerStore } from "~/entities/messenger/messenger-bootstrap.lib";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";

// Layout owns the temporary messenger bootstrap until a dedicated process layer exists.
export function useLayoutWorkspaceMessengerBootstrap(): void {
  const runtimeContext = useWorkspaceAuthStore((state) => state.getCurrentRuntimeContext());
  const clearMessengerStore = useMessengerStore((state) => state.clear);

  useEffect(() => {
    if (runtimeContext == null) {
      clearMessengerStore();
      return;
    }

    const controller = new AbortController();
    void bootstrapMessengerStore({
      runtimeContext,
      getRuntimeContext: () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
      signal: controller.signal,
    }).catch((error) => {
      reportUnexpectedError("workspace-messenger:bootstrap", error);
    });

    return () => {
      controller.abort();
    };
  }, [clearMessengerStore, runtimeContext]);
}
