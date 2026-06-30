import { useEffect, useMemo } from "react";
import { createMessengerRealtimeActiveApplier } from "~/entities/messenger/messenger-realtime-applier.lib";
import { buildMessengerRequestOptions } from "~/entities/messenger/messenger-request-options.lib";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import { parseWorkspaceMessengerRoute } from "~/shared/lib/workspace-messenger-route.lib";
import {
  createWorkspaceRealtimeBrowserCursorStorage,
  type WorkspaceRealtimeDurableCursorStorage,
} from "~/shared/lib/workspace-realtime/workspace-realtime-cursor.lib";
import {
  createWorkspaceRealtimeTransportCore,
  type WorkspaceRealtimeEventApplier,
  type WorkspaceRealtimeRuntimeOwner,
  type WorkspaceRealtimeTransportCore,
} from "~/shared/lib/workspace-realtime/workspace-realtime-runtime.lib";

export interface LayoutWorkspaceRealtimeRuntimeFactoryOptions {
  runtimeContext: WorkspaceRuntimeContext;
  cursorStorage: WorkspaceRealtimeDurableCursorStorage;
  applier: WorkspaceRealtimeEventApplier;
  isOwnerCurrent: (owner: WorkspaceRealtimeRuntimeOwner) => boolean;
}

export type LayoutWorkspaceRealtimeRuntimeFactory = (
  options: LayoutWorkspaceRealtimeRuntimeFactoryOptions,
) => WorkspaceRealtimeTransportCore;

export interface UseLayoutWorkspaceRealtimeOptions {
  enabled: boolean;
  pathname: string;
  runtimeFactory?: LayoutWorkspaceRealtimeRuntimeFactory;
  cursorStorageFactory?: () => WorkspaceRealtimeDurableCursorStorage | null;
  applier?: WorkspaceRealtimeEventApplier;
}

function toWorkspaceRealtimeOwner(
  runtimeContext: WorkspaceRuntimeContext,
): WorkspaceRealtimeRuntimeOwner {
  return {
    accountId: runtimeContext.accountId,
    instanceId: runtimeContext.instanceId,
    organizationId: runtimeContext.organizationId,
    projectId: runtimeContext.projectId,
    userUuid: runtimeContext.userUuid,
    runtimeGeneration: runtimeContext.runtimeGeneration,
  };
}

export function isLayoutWorkspaceRealtimeOwnerCurrent(
  owner: WorkspaceRealtimeRuntimeOwner,
  getRuntimeContext: () => WorkspaceRuntimeContext | null,
): boolean {
  const current = getRuntimeContext();
  if (current == null) return false;

  // runtimeGeneration проверяем на active boundary: старый сокет может закрыться позже,
  // но его callbacks уже не должны считаться текущим project-runtime.
  return (
    workspaceRuntimeOwnerKey(current) === workspaceRuntimeOwnerKey(owner) &&
    current.runtimeGeneration === owner.runtimeGeneration
  );
}

function shouldStartWorkspaceRealtimeForRoute(
  enabled: boolean,
  pathname: string,
  runtimeContext: WorkspaceRuntimeContext | null,
): runtimeContext is WorkspaceRuntimeContext {
  if (!enabled || runtimeContext == null) return false;
  const routeMatch = parseWorkspaceMessengerRoute(pathname);
  if (routeMatch == null) return false;
  return routeMatch.projectId === runtimeContext.projectId;
}

function defaultRuntimeFactory({
  runtimeContext,
  cursorStorage,
  applier,
  isOwnerCurrent,
}: LayoutWorkspaceRealtimeRuntimeFactoryOptions): WorkspaceRealtimeTransportCore {
  return createWorkspaceRealtimeTransportCore({
    clientOptions: buildMessengerRequestOptions(runtimeContext),
    cursorStorage,
    applier,
    isOwnerCurrent,
    onDiagnostic: (diagnostic) => {
      reportUnexpectedError("workspace-realtime:transport", diagnostic.error ?? diagnostic.reason);
    },
  });
}

export function useLayoutWorkspaceRealtime(options: UseLayoutWorkspaceRealtimeOptions): void {
  const {
    enabled,
    pathname,
    runtimeFactory = defaultRuntimeFactory,
    cursorStorageFactory = createWorkspaceRealtimeBrowserCursorStorage,
    applier,
  } = options;
  const sessions = useWorkspaceAuthStore((state) => state.sessions);
  const currentAccountId = useWorkspaceAuthStore((state) => state.currentAccountId);
  const runtimeContext = useMemo(
    () => selectCurrentWorkspaceRuntimeContext({ sessions, currentAccountId }),
    [sessions, currentAccountId],
  );

  useEffect(() => {
    if (!shouldStartWorkspaceRealtimeForRoute(enabled, pathname, runtimeContext)) {
      return;
    }

    const cursorStorage = cursorStorageFactory();
    if (cursorStorage == null) return;

    const controller = new AbortController();
    const owner = toWorkspaceRealtimeOwner(runtimeContext);
    const ownerKey = workspaceRuntimeOwnerKey(owner);
    const isOwnerCurrent = (candidate: WorkspaceRealtimeRuntimeOwner): boolean =>
      isLayoutWorkspaceRealtimeOwnerCurrent(candidate, () =>
        useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
      );
    const runtimeApplier = applier ?? createMessengerRealtimeActiveApplier({ isOwnerCurrent });
    const runtime = runtimeFactory({
      runtimeContext,
      cursorStorage,
      applier: runtimeApplier,
      isOwnerCurrent,
    });

    void runtime
      .start({
        owner,
        ownerKey,
        surface: "active",
        signal: controller.signal,
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          reportUnexpectedError("workspace-realtime:start", error);
        }
      });

    return () => {
      controller.abort();
      void runtime.stop("layout_cleanup").catch((error) => {
        reportUnexpectedError("workspace-realtime:stop", error);
      });
    };
  }, [applier, cursorStorageFactory, enabled, pathname, runtimeContext, runtimeFactory]);
}
