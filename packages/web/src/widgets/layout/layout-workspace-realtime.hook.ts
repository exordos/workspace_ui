import { useEffect, useMemo, useRef } from "react";
import {
  createMessengerRealtimeActiveApplier,
  createMessengerRealtimeBackgroundApplier,
} from "~/entities/messenger/messenger-realtime-applier.lib";
import { buildMessengerRequestOptions } from "~/entities/messenger/messenger-request-options.lib";
import { createUserRealtimeApplier } from "~/entities/user/user-realtime-applier.lib";
import { startWorkspacePresenceReporter } from "~/entities/user/user-workspace-presence-reporter.lib";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import type { WorkspaceAuthSession } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import { parseWorkspaceMessengerRoute } from "~/shared/lib/workspace-messenger-route.lib";
import { composeWorkspaceRealtimeAppliers } from "~/shared/lib/workspace-realtime/workspace-realtime-applier.lib";
import {
  createWorkspaceRealtimeBrowserCursorStorage,
  type WorkspaceRealtimeDurableCursorStorage,
} from "~/shared/lib/workspace-realtime/workspace-realtime-cursor.lib";
import {
  createWorkspaceRealtimeRuntimeManager,
  type WorkspaceRealtimeManagerRuntimeContext,
  type WorkspaceRealtimeRuntimeManager,
} from "~/shared/lib/workspace-realtime/workspace-realtime-manager.lib";
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
  onDiagnostic: Parameters<typeof createWorkspaceRealtimeTransportCore>[0]["onDiagnostic"];
}

export type LayoutWorkspaceRealtimeRuntimeFactory = (
  options: LayoutWorkspaceRealtimeRuntimeFactoryOptions,
) => WorkspaceRealtimeTransportCore;

export type LayoutWorkspacePresenceReporterFactory = (
  runtimeContext: WorkspaceRuntimeContext,
) => () => void;

export interface UseLayoutWorkspaceRealtimeOptions {
  enabled: boolean;
  pathname: string;
  runtimeFactory?: LayoutWorkspaceRealtimeRuntimeFactory;
  cursorStorageFactory?: () => WorkspaceRealtimeDurableCursorStorage | null;
  applier?: WorkspaceRealtimeEventApplier;
  presenceReporterFactory?: LayoutWorkspacePresenceReporterFactory;
}

interface LayoutWorkspaceRealtimeManagerContext extends WorkspaceRealtimeManagerRuntimeContext {
  runtimeContext: WorkspaceRuntimeContext;
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

function toWorkspaceRuntimeContext(session: WorkspaceAuthSession): WorkspaceRuntimeContext {
  return {
    accountId: session.accountId,
    instanceId: session.instanceId,
    organizationId: session.organizationId,
    organizationOrigin: session.organizationOrigin,
    projectId: session.projectId,
    userUuid: session.userUuid,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    runtimeGeneration: session.runtimeGeneration,
  };
}

function toLayoutRealtimeManagerContext(
  session: WorkspaceAuthSession,
): LayoutWorkspaceRealtimeManagerContext {
  const runtimeContext = toWorkspaceRuntimeContext(session);
  const owner = toWorkspaceRealtimeOwner(runtimeContext);
  return {
    owner,
    ownerKey: workspaceRuntimeOwnerKey(owner),
    // Access token lives only in manager memory: transport core is created with clientOptions once.
    // When token/origin changes, runtimeKey makes the manager recreate the socket.
    runtimeKey: [runtimeContext.organizationOrigin, runtimeContext.accessToken].join("\u0000"),
    runtimeContext,
  };
}

export function isLayoutWorkspaceRealtimeOwnerCurrent(
  owner: WorkspaceRealtimeRuntimeOwner,
  getRuntimeContext: () => WorkspaceRuntimeContext | null,
): boolean {
  const current = getRuntimeContext();
  if (current == null) return false;

  // runtimeGeneration is checked at the active boundary: an old socket can close later,
  // but its callbacks must no longer count as the current project runtime.
  return (
    workspaceRuntimeOwnerKey(current) === workspaceRuntimeOwnerKey(owner) &&
    current.runtimeGeneration === owner.runtimeGeneration
  );
}

function shouldStartWorkspaceRealtimeForRoute(
  enabled: boolean,
  pathname: string,
  activeRuntimeContext: WorkspaceRuntimeContext | null,
): activeRuntimeContext is WorkspaceRuntimeContext {
  if (!enabled || activeRuntimeContext == null) return false;
  const routeMatch = parseWorkspaceMessengerRoute(pathname);
  if (routeMatch == null) return false;
  return routeMatch.projectId === activeRuntimeContext.projectId;
}

function defaultRuntimeFactory({
  runtimeContext,
  cursorStorage,
  applier,
  isOwnerCurrent,
  onDiagnostic,
}: LayoutWorkspaceRealtimeRuntimeFactoryOptions): WorkspaceRealtimeTransportCore {
  return createWorkspaceRealtimeTransportCore({
    clientOptions: buildMessengerRequestOptions(runtimeContext),
    cursorStorage,
    applier,
    isOwnerCurrent,
    webSocketBaseUrl: runtimeContext.organizationOrigin,
    onDiagnostic: (diagnostic) => {
      onDiagnostic?.(diagnostic);
      reportUnexpectedError("workspace-realtime:transport", diagnostic.error ?? diagnostic.reason);
    },
  });
}

function defaultPresenceReporterFactory(runtimeContext: WorkspaceRuntimeContext): () => void {
  return startWorkspacePresenceReporter({
    clientOptions: buildMessengerRequestOptions(runtimeContext),
    userUuid: runtimeContext.userUuid,
    onError: (error) => {
      reportUnexpectedError("workspace-presence:report", error);
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
    presenceReporterFactory = defaultPresenceReporterFactory,
  } = options;
  const sessions = useWorkspaceAuthStore((state) => state.sessions);
  const currentAccountId = useWorkspaceAuthStore((state) => state.currentAccountId);
  const activeRuntimeContext = useMemo(() => {
    const activeSession =
      sessions.find((session) => session.accountId === currentAccountId) ?? null;
    return activeSession == null ? null : toWorkspaceRuntimeContext(activeSession);
  }, [sessions, currentAccountId]);
  const managerContexts = useMemo(
    () => sessions.map((session) => toLayoutRealtimeManagerContext(session)),
    [sessions],
  );
  const managerContextsRef = useRef(managerContexts);
  const managerRef =
    useRef<WorkspaceRealtimeRuntimeManager<LayoutWorkspaceRealtimeManagerContext> | null>(null);

  useEffect(() => {
    return () => {
      const manager = managerRef.current;
      managerRef.current = null;
      void manager?.stopAll("layout_cleanup").catch((error) => {
        reportUnexpectedError("workspace-realtime:stop", error);
      });
    };
  }, [applier, cursorStorageFactory, runtimeFactory]);

  useEffect(() => {
    managerContextsRef.current = managerContexts;
  }, [managerContexts]);

  useEffect(() => {
    function ensureManager(): WorkspaceRealtimeRuntimeManager<LayoutWorkspaceRealtimeManagerContext> | null {
      if (managerRef.current != null) return managerRef.current;

      const cursorStorage = cursorStorageFactory();
      if (cursorStorage == null) return null;

      const manager = createWorkspaceRealtimeRuntimeManager<LayoutWorkspaceRealtimeManagerContext>({
        runtimeFactory: ({
          runtimeContext,
          applier: runtimeApplier,
          isOwnerCurrent,
          onDiagnostic,
        }) =>
          runtimeFactory({
            runtimeContext: runtimeContext.runtimeContext,
            cursorStorage,
            applier: runtimeApplier,
            isOwnerCurrent,
            onDiagnostic,
          }),
        activeApplierFactory: ({ isOwnerCurrent }) =>
          applier ??
          composeWorkspaceRealtimeAppliers([
            createMessengerRealtimeActiveApplier({ isOwnerCurrent }),
            createUserRealtimeApplier({ isOwnerCurrent }),
          ]),
        backgroundApplierFactory: ({ isOwnerCurrent }) =>
          composeWorkspaceRealtimeAppliers([
            createMessengerRealtimeBackgroundApplier({ isOwnerCurrent }),
            createUserRealtimeApplier({ isOwnerCurrent }),
          ]),
        isOwnerCurrent: (candidate) =>
          managerContextsRef.current.some(
            (context) =>
              context.ownerKey === workspaceRuntimeOwnerKey(candidate) &&
              context.owner.runtimeGeneration === candidate.runtimeGeneration,
          ),
        onDiagnostic: (diagnostic) => {
          reportUnexpectedError(
            "workspace-realtime:manager",
            diagnostic.error ?? diagnostic.reason,
          );
        },
      });
      managerRef.current = manager;
      return manager;
    }

    if (!shouldStartWorkspaceRealtimeForRoute(enabled, pathname, activeRuntimeContext)) {
      // Outside the workspace messenger route, do not keep realtime alive: this is the current route host, not a global daemon.
      void managerRef.current?.stopAll("layout_inactive").catch((error) => {
        reportUnexpectedError("workspace-realtime:stop", error);
      });
      return;
    }

    const manager = ensureManager();
    if (manager == null) return;

    const activeOwnerKey = workspaceRuntimeOwnerKey(activeRuntimeContext);

    void manager.update(managerContexts, activeOwnerKey).catch((error) => {
      reportUnexpectedError("workspace-realtime:start", error);
    });
  }, [
    activeRuntimeContext,
    applier,
    cursorStorageFactory,
    enabled,
    managerContexts,
    pathname,
    runtimeFactory,
  ]);

  useEffect(() => {
    if (!shouldStartWorkspaceRealtimeForRoute(enabled, pathname, activeRuntimeContext)) {
      return undefined;
    }

    return presenceReporterFactory(activeRuntimeContext);
  }, [activeRuntimeContext, enabled, pathname, presenceReporterFactory]);
}
