import { repairDeletedMessagePointers } from "~/applications/messenger/model/chats/messenger-deleted-message-pointer-repair.lib";
import { getWorkspaceMessageStoreForOwner } from "~/applications/messenger/model/messages/message.model";
import { createMessengerReactionAggregateRevalidateHandler } from "~/applications/messenger/model/messages/messenger-message-reactions-actions.lib";
import { messengerRealtimeActiveCache } from "~/applications/messenger/model/messenger-cache.lib";
import { buildWorkspaceRequestOptions } from "~/applications/messenger/model/messenger-request-options.lib";
import {
  createMessengerRealtimeActiveApplier,
  type MessengerRealtimeActiveApplierOptions,
} from "~/applications/messenger/runtime/sync/messenger-realtime-applier.lib";
import { removeMessengerStreamProjection } from "~/applications/messenger/runtime/sync/messenger-stream-projection-cleanup.lib";
import { createActivityRealtimeApplier } from "~/entities/activity/activity-realtime-applier.lib";
import { createExternalAccountRealtimeApplier } from "~/entities/external-account/external-account-realtime-applier.lib";
import { createExternalChatRealtimeApplier } from "~/entities/external-chat/external-chat-realtime-applier.lib";
import { workspaceStatusDecoration } from "~/entities/user/user-presence-status.lib";
import { createUserRealtimeApplier } from "~/entities/user/user-realtime-applier.lib";
import { selectUserDisplayName } from "~/entities/user/user-selectors.lib";
import { startWorkspacePresenceReporter } from "~/entities/user/user-workspace-presence-reporter.lib";
import { useUsersStore } from "~/entities/user/user.model";
import { ensureFreshWorkspaceSession } from "~/entities/workspace-auth/workspace-auth.lib";
import {
  useWorkspaceAuthStore,
  workspaceAuthSessionIncarnation,
  type WorkspaceAuthSession,
} from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { useWorkspaceJitsiSettingsStore } from "~/features/jitsi-call/jitsi-call-settings.model";
import { useJitsiCallStore } from "~/features/jitsi-call/jitsi-call.model";
import { buildWorkspaceIncomingDmCallInvite } from "~/features/jitsi-call/workspace-jitsi-incoming-call.lib";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import { composeWorkspaceRealtimeAppliers } from "~/shared/lib/workspace-realtime/workspace-realtime-applier.lib";
import type { WorkspaceRealtimeDurableCursorStorage } from "~/shared/lib/workspace-realtime/workspace-realtime-cursor.lib";
import {
  createWorkspaceRealtimeRuntimeManager,
  type WorkspaceRealtimeManagerRuntimeContext,
} from "~/shared/lib/workspace-realtime/workspace-realtime-manager.lib";
import {
  createWorkspaceRealtimeTransportCore,
  type WorkspaceRealtimeRuntimeOwner,
} from "~/shared/lib/workspace-realtime/workspace-realtime-runtime.lib";
import {
  prepareWorkspaceSessionParticipant,
  prepareWorkspaceSessionSnapshots,
  readWorkspaceSession,
} from "./workspace-session-bootstrap.lib";

// Keep request credentials and the durable owner identity together in one manager entry.
interface WorkspaceSessionContext extends WorkspaceRealtimeManagerRuntimeContext {
  runtimeContext: WorkspaceRuntimeContext;
}

// Recreate the transport when its immutable request credentials change.
export function toWorkspaceSessionContext(
  runtimeContext: WorkspaceAuthSession,
): WorkspaceSessionContext {
  const { accountId, instanceId, organizationId, projectId, userUuid, runtimeGeneration } =
    runtimeContext;
  return {
    owner: { accountId, instanceId, organizationId, projectId, userUuid, runtimeGeneration },
    ownerKey: workspaceRuntimeOwnerKey(runtimeContext),
    runtimeKey: [
      workspaceAuthSessionIncarnation(runtimeContext),
      runtimeContext.organizationOrigin,
      runtimeContext.accessToken,
    ].join("\u0000"),
    runtimeContext,
  };
}

// Repair loaded catalog pointers through the owning model after a message is removed.
const repairRealtimeDeletedMessagePointers: NonNullable<
  MessengerRealtimeActiveApplierOptions["onMessageDeleted"]
> = (_ownerKey, _message, plan, context, isCurrent) => {
  const getRuntimeContext = () => readWorkspaceSession(context.owner);
  const runtimeContext = getRuntimeContext();
  if (runtimeContext == null) return;
  return repairDeletedMessagePointers({
    runtimeContext,
    plan,
    getRuntimeContext,
    cache: messengerRealtimeActiveCache,
    signal: context.signal,
    isCurrent,
  });
};

// The applier calls this only for live frames, outside recovery and catch-up.
const ingestRealtimeCallInvite: NonNullable<
  MessengerRealtimeActiveApplierOptions["onMessageCreated"]
> = (ownerKey, message, stream, context) => {
  if (readWorkspaceSession(context.owner, "active") == null) return;
  const { usersById } = useUsersStore.getState();
  const currentUserUuid = context.owner.userUuid;
  const currentUserDisplayName = selectUserDisplayName(usersById[currentUserUuid], currentUserUuid);
  const invite = buildWorkspaceIncomingDmCallInvite({
    ownerKey,
    message,
    stream,
    usersById,
    currentUserUuid,
    currentUserDisplayName,
    meetUrl: useWorkspaceJitsiSettingsStore.getState().getWorkspaceMeetUrl(ownerKey),
  });
  if (invite != null) useJitsiCallStore.getState().ingestIncomingInvite(invite);
};

// Refresh own reactions in the model that received the event, even when it is off-screen.
const revalidateRealtimeOwnReactions: NonNullable<
  MessengerRealtimeActiveApplierOptions["onMessageReactionAggregateUpdated"]
> = (ownerKey, message, context) => {
  const getRuntimeContext = () => readWorkspaceSession(context.owner);
  const runtimeContext = getRuntimeContext();
  if (runtimeContext == null) return;
  createMessengerReactionAggregateRevalidateHandler({
    runtimeContext,
    getRuntimeContext,
    signal: context.signal,
    store: getWorkspaceMessageStoreForOwner(ownerKey) ?? undefined,
  })(ownerKey, message);
};

// Only UI-specific effects depend on which authorized session is currently selected.
function currentSurface(owner: WorkspaceRealtimeRuntimeOwner): "active" | "background" {
  return useWorkspaceAuthStore.getState().currentAccountId === owner.accountId
    ? "active"
    : "background";
}

function createOwnerApplier(isOwnerCurrent: (owner: WorkspaceRealtimeRuntimeOwner) => boolean) {
  return createMessengerRealtimeActiveApplier({
    isOwnerCurrent,
    applyToBothSurfaces: true,
    requireActiveCatalog: true,
    onMessageCreated: ingestRealtimeCallInvite,
    onMessageDeleted: repairRealtimeDeletedMessagePointers,
    onMessageReactionAggregateUpdated: revalidateRealtimeOwnReactions,
  });
}

// Compose real application participants once per authorized workspace runtime.
export function createWorkspaceSessionRuntimeManager(
  cursorStorage: WorkspaceRealtimeDurableCursorStorage,
) {
  return createWorkspaceRealtimeRuntimeManager<WorkspaceSessionContext>({
    runtimeFactory: ({
      runtimeContext: { runtimeContext },
      applier,
      isOwnerCurrent,
      onDiagnostic,
    }) =>
      createWorkspaceRealtimeTransportCore({
        clientOptions: buildWorkspaceRequestOptions(runtimeContext),
        cursorStorage,
        applier,
        isOwnerCurrent,
        webSocketBaseUrl: runtimeContext.organizationOrigin,
        refreshSession: (accountId, options) => ensureFreshWorkspaceSession(accountId, options),
        prepareSnapshots: (context, preparation) =>
          prepareWorkspaceSessionSnapshots(
            { ...context, surface: currentSurface(context.owner) },
            preparation,
            () => isOwnerCurrent(context.owner),
          ),
        prepareParticipant: (context, participant) =>
          prepareWorkspaceSessionParticipant(
            { ...context, surface: currentSurface(context.owner) },
            participant,
            () => isOwnerCurrent(context.owner),
          ),
        onDiagnostic,
      }),
    selectSurface: ({ owner }) => currentSurface(owner),
    activeApplierFactory: ({ isOwnerCurrent }) => {
      const isActive = (owner: WorkspaceRealtimeRuntimeOwner) =>
        isOwnerCurrent(owner) && readWorkspaceSession(owner, "active") != null;
      return composeWorkspaceRealtimeAppliers([
        createActivityRealtimeApplier({
          isOwnerCurrent: isActive,
          getViewGeneration: () =>
            useWorkspaceAuthStore.getState().getCurrentRuntimeContext()?.runtimeGeneration,
        }),
        createExternalAccountRealtimeApplier({ surface: "active", isOwnerCurrent: isActive }),
        createExternalChatRealtimeApplier({ surface: "active", isOwnerCurrent: isActive }),
        createOwnerApplier(isOwnerCurrent),
        createUserRealtimeApplier({ isOwnerCurrent, requireActiveProjection: true }),
      ]);
    },
    backgroundApplierFactory: ({ isOwnerCurrent }) => {
      const isBackground = (owner: WorkspaceRealtimeRuntimeOwner) =>
        isOwnerCurrent(owner) && readWorkspaceSession(owner, "background") != null;
      return composeWorkspaceRealtimeAppliers([
        createExternalAccountRealtimeApplier({
          surface: "background",
          isOwnerCurrent: isBackground,
        }),
        createExternalChatRealtimeApplier({
          surface: "background",
          isOwnerCurrent: isBackground,
          removeProjection: (options) =>
            removeMessengerStreamProjection({ ...options, removeActiveProjection: true }),
        }),
        createOwnerApplier(isOwnerCurrent),
        createUserRealtimeApplier({ isOwnerCurrent, requireActiveProjection: true }),
      ]);
    },
    isOwnerCurrent(owner, _surface, { runtimeContext }) {
      const current = readWorkspaceSession(owner);
      return (
        current?.accessToken === runtimeContext.accessToken &&
        current.organizationOrigin === runtimeContext.organizationOrigin
      );
    },
    onDiagnostic: (diagnostic) =>
      reportUnexpectedError("workspace-realtime:transport", diagnostic.error ?? diagnostic.reason),
  });
}

// Report presence only when the selected owner's own profile can protect DND and status decoration.
export function startWorkspaceSessionPresence(runtimeContext: WorkspaceRuntimeContext): () => void {
  const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
  const readOwnUser = () => {
    if (readWorkspaceSession(runtimeContext, "active") == null) return null;
    const users = useUsersStore.getState();
    return users.ownerKey === ownerKey ? (users.usersById[runtimeContext.userUuid] ?? null) : null;
  };
  return startWorkspacePresenceReporter({
    clientOptions: buildWorkspaceRequestOptions(runtimeContext),
    userUuid: runtimeContext.userUuid,
    getAccountStatus: () => readOwnUser()?.status ?? null,
    getStatusDecoration: () => workspaceStatusDecoration(readOwnUser()),
    onError: (error) => reportUnexpectedError("workspace-presence:report", error),
  });
}
