import { useEffect, useMemo, useRef } from "react";
import {
  adaptWorkspaceExternalAccountDto,
  toWorkspaceExternalAccountCacheProfile,
} from "~/entities/external-account/external-account-adapters.lib";
import { loadExternalAccounts } from "~/entities/external-account/external-account-loader.lib";
import { createExternalAccountRealtimeApplier } from "~/entities/external-account/external-account-realtime-applier.lib";
import { createExternalChatRealtimeApplier } from "~/entities/external-chat/external-chat-realtime-applier.lib";
import { useExternalChatsStore } from "~/entities/external-chat/external-chat.model";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import { bootstrapMessengerStore } from "~/entities/messenger/messenger-bootstrap.lib";
import { createMessengerReactionAggregateRevalidateHandler } from "~/entities/messenger/messenger-message-reactions-actions.lib";
import {
  createMessengerRealtimeActiveApplier,
  createMessengerRealtimeBackgroundApplier,
} from "~/entities/messenger/messenger-realtime-applier.lib";
import { buildWorkspaceRequestOptions } from "~/entities/messenger/messenger-request-options.lib";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import { createUserRealtimeApplier } from "~/entities/user/user-realtime-applier.lib";
import { selectUserDisplayName } from "~/entities/user/user-selectors.lib";
import { startWorkspacePresenceReporter } from "~/entities/user/user-workspace-presence-reporter.lib";
import { useUsersStore } from "~/entities/user/user.model";
import { ensureFreshWorkspaceSession } from "~/entities/workspace-auth/workspace-auth.lib";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import type { WorkspaceAuthSession } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { useWorkspaceJitsiSettingsStore } from "~/features/jitsi-call/jitsi-call-settings.model";
import { useJitsiCallStore } from "~/features/jitsi-call/jitsi-call.model";
import { buildWorkspaceIncomingDmCallInvite } from "~/features/jitsi-call/workspace-jitsi-incoming-call.lib";
import { getExternalAccounts } from "~/shared/api/messenger-external-accounts.api";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import {
  deleteWorkspaceExternalAccountOwnerCache,
  replaceWorkspaceExternalAccountCache,
} from "~/shared/lib/workspace-external-account-cache-db";
import { deleteWorkspaceMessengerOwnerCache } from "~/shared/lib/workspace-messenger-cache-db";
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
  type WorkspaceRealtimeSessionRefresh,
  type WorkspaceRealtimeTransportCore,
} from "~/shared/lib/workspace-realtime/workspace-realtime-runtime.lib";

export interface LayoutWorkspaceRealtimeRuntimeFactoryOptions {
  runtimeContext: WorkspaceRuntimeContext;
  cursorStorage: WorkspaceRealtimeDurableCursorStorage;
  applier: WorkspaceRealtimeEventApplier;
  isOwnerCurrent: (owner: WorkspaceRealtimeRuntimeOwner) => boolean;
  refreshSession: WorkspaceRealtimeSessionRefresh;
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
  refreshSession?: WorkspaceRealtimeSessionRefresh;
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

function isAbortSignalAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

async function defaultWorkspaceRealtimeRefreshSession(
  accountId: string,
  options: Parameters<WorkspaceRealtimeSessionRefresh>[1],
): Promise<void> {
  if (isAbortSignalAborted(options.signal)) {
    throw new DOMException("Workspace realtime auth refresh aborted", "AbortError");
  }
  await ensureFreshWorkspaceSession(accountId, { force: true, signal: options.signal });
  if (isAbortSignalAborted(options.signal)) {
    throw new DOMException("Workspace realtime auth refresh aborted", "AbortError");
  }
}

function defaultRuntimeFactory({
  runtimeContext,
  cursorStorage,
  applier,
  isOwnerCurrent,
  refreshSession,
  onDiagnostic,
}: LayoutWorkspaceRealtimeRuntimeFactoryOptions): WorkspaceRealtimeTransportCore {
  return createWorkspaceRealtimeTransportCore({
    clientOptions: buildWorkspaceRequestOptions(runtimeContext),
    cursorStorage,
    applier,
    isOwnerCurrent,
    webSocketBaseUrl: runtimeContext.organizationOrigin,
    refreshSession,
    resetAuthoritativeSnapshots: async (realtimeContext) => {
      const ownerKey = workspaceRuntimeOwnerKey(realtimeContext.owner);
      await Promise.all([
        deleteWorkspaceMessengerOwnerCache(ownerKey),
        deleteWorkspaceExternalAccountOwnerCache(ownerKey),
      ]);

      const currentRuntimeContext = useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
      const isActiveOwner =
        currentRuntimeContext != null &&
        workspaceRuntimeOwnerKey(currentRuntimeContext) === ownerKey &&
        currentRuntimeContext.runtimeGeneration === realtimeContext.owner.runtimeGeneration;
      const isRuntimeOwnerCurrent = (): boolean =>
        useWorkspaceAuthStore
          .getState()
          .sessions.some(
            (session) =>
              workspaceRuntimeOwnerKey(session) === ownerKey &&
              session.runtimeGeneration === realtimeContext.owner.runtimeGeneration,
          );

      if (!isRuntimeOwnerCurrent()) {
        return;
      }

      if (isActiveOwner) {
        // Active stores are owner scoped in memory. Background recovery only refreshes its cache.
        useMessengerStore.getState().clear();
        useWorkspaceMessageStore.getState().clear();
        useExternalChatsStore.getState().clear();
        const [, externalAccountsResult] = await Promise.all([
          bootstrapMessengerStore({
            runtimeContext,
            getRuntimeContext: () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
            loadDrafts: false,
          }),
          loadExternalAccounts({
            runtimeContext,
            getRuntimeContext: () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
            signal: realtimeContext.signal,
          }),
        ]);
        if (externalAccountsResult.status === "failed") {
          throw new Error(externalAccountsResult.error);
        }
        return;
      }

      const accountDtos = await getExternalAccounts(
        buildWorkspaceRequestOptions(runtimeContext, undefined, realtimeContext.signal),
      );
      if (!isRuntimeOwnerCurrent()) return;
      await replaceWorkspaceExternalAccountCache(
        ownerKey,
        accountDtos
          .map((account) => adaptWorkspaceExternalAccountDto(account))
          .map(toWorkspaceExternalAccountCacheProfile),
        isRuntimeOwnerCurrent,
      );
    },
    onDiagnostic: (diagnostic) => {
      onDiagnostic?.(diagnostic);
      reportUnexpectedError("workspace-realtime:transport", diagnostic.error ?? diagnostic.reason);
    },
  });
}

function defaultPresenceReporterFactory(runtimeContext: WorkspaceRuntimeContext): () => void {
  return startWorkspacePresenceReporter({
    clientOptions: buildWorkspaceRequestOptions(runtimeContext),
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
    refreshSession = defaultWorkspaceRealtimeRefreshSession,
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
            refreshSession,
            onDiagnostic,
          }),
        activeApplierFactory: ({ isOwnerCurrent }) =>
          applier ??
          composeWorkspaceRealtimeAppliers([
            createExternalAccountRealtimeApplier({
              surface: "active",
              isOwnerCurrent,
            }),
            createExternalChatRealtimeApplier({
              surface: "active",
              isOwnerCurrent,
            }),
            createMessengerRealtimeActiveApplier({
              isOwnerCurrent,
              onMessageCreated: (ownerKey, message, stream, eventContext) => {
                const usersById = useUsersStore.getState().usersById;
                const currentUser = usersById[eventContext.owner.userUuid];
                const currentUserDisplayName = selectUserDisplayName(
                  currentUser,
                  eventContext.owner.userUuid,
                );
                const invite = buildWorkspaceIncomingDmCallInvite({
                  ownerKey,
                  message,
                  stream,
                  usersById,
                  currentUserUuid: eventContext.owner.userUuid,
                  currentUserDisplayName,
                  meetUrl: useWorkspaceJitsiSettingsStore.getState().getWorkspaceMeetUrl(ownerKey),
                });
                if (invite != null) {
                  useJitsiCallStore.getState().ingestIncomingInvite(invite);
                }
              },
              // Active realtime sees only aggregate counters. Own reaction rows are
              // revalidated by the action layer so realtime stays transport-focused.
              onMessageReactionAggregateUpdated:
                activeRuntimeContext == null
                  ? undefined
                  : createMessengerReactionAggregateRevalidateHandler({
                      runtimeContext: activeRuntimeContext,
                      getRuntimeContext: () =>
                        useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
                    }),
            }),
            createUserRealtimeApplier({ isOwnerCurrent }),
          ]),
        backgroundApplierFactory: ({ isOwnerCurrent }) =>
          composeWorkspaceRealtimeAppliers([
            createExternalAccountRealtimeApplier({
              surface: "background",
              isOwnerCurrent,
            }),
            createExternalChatRealtimeApplier({
              surface: "background",
              isOwnerCurrent,
            }),
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
    refreshSession,
    runtimeFactory,
  ]);

  useEffect(() => {
    if (!shouldStartWorkspaceRealtimeForRoute(enabled, pathname, activeRuntimeContext)) {
      return undefined;
    }

    return presenceReporterFactory(activeRuntimeContext);
  }, [activeRuntimeContext, enabled, pathname, presenceReporterFactory]);
}
