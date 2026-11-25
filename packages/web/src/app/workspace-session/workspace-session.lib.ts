import { repairDeletedMessagePointers } from "~/applications/messenger/model/chats/messenger-deleted-message-pointer-repair.lib";
import { createMessengerReactionAggregateRevalidateHandler } from "~/applications/messenger/model/messages/messenger-message-reactions-actions.lib";
import {
  createMessengerRealtimeApplier,
  type MessengerRealtimeApplierOptions,
} from "~/applications/messenger/runtime/sync/messenger-realtime-applier.lib";
import { removeMessengerStreamProjection } from "~/applications/messenger/runtime/sync/messenger-stream-projection-cleanup.lib";
import { createActivityRealtimeApplier } from "~/entities/activity/activity-realtime-applier.lib";
import { createExternalAccountRealtimeApplier } from "~/entities/external-account/external-account-realtime-applier.lib";
import { createExternalChatRealtimeApplier } from "~/entities/external-chat/external-chat-realtime-applier.lib";
import {
  buildWorkspaceRequestOptions,
  ensureFreshWorkspaceSession,
} from "~/entities/workspace-auth/workspace-auth.lib";
import {
  useWorkspaceAuthStore,
  workspaceAuthSessionIncarnation,
  type WorkspaceAuthSession,
} from "~/entities/workspace-auth/workspace-auth.model";
import { useWorkspaceJitsiSettingsStore } from "~/features/jitsi-call/jitsi-call-settings.model";
import { useJitsiCallStore } from "~/features/jitsi-call/jitsi-call.model";
import { buildWorkspaceIncomingDmCallInvite } from "~/features/jitsi-call/workspace-jitsi-incoming-call.lib";
import { readActiveUser, readActiveUsers } from "~/modules/users/users";
import {
  createUserRealtimeApplier,
  startWorkspacePresenceReporter,
  workspaceStatusDecoration,
} from "~/modules/users/users-runtime";
import { selectUserDisplayName } from "~/modules/users/users-selectors";
import type { UsersById } from "~/modules/users/users-types";
import { composeWorkspaceRealtimeAppliers } from "~/platform/realtime/workspace-realtime-applier.lib";
import type { WorkspaceRealtimeDurableCursorStorage } from "~/platform/realtime/workspace-realtime-cursor.lib";
import {
  createWorkspaceRealtimeRuntimeManager,
  type WorkspaceRealtimeManagerRuntimeContext,
} from "~/platform/realtime/workspace-realtime-manager.lib";
import {
  createWorkspaceRealtimeTransportCore,
  type WorkspaceRealtimeEventContext,
  type WorkspaceRealtimeRuntimeOwner,
} from "~/platform/realtime/workspace-realtime-runtime.lib";
import { workspaceRuntimeOwnerKey } from "~/platform/sessions/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/platform/sessions/workspace-runtime.types";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
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
  MessengerRealtimeApplierOptions["onMessageDeleted"]
> = (_ownerKey, _message, plan, context, isCurrent) => {
  const getRuntimeContext = () => readWorkspaceSession(context.owner);
  const runtimeContext = getRuntimeContext();
  if (runtimeContext == null) return;
  return repairDeletedMessagePointers({
    runtimeContext,
    plan,
    getRuntimeContext,
    signal: context.signal,
    isCurrent,
  });
};

const EMPTY_CALL_INVITE_USERS: Readonly<UsersById> = {};

// The applier calls this only for live frames, outside recovery and catch-up.
const ingestRealtimeCallInvite: NonNullable<MessengerRealtimeApplierOptions["onMessageCreated"]> = (
  ownerKey,
  message,
  stream,
  context,
) => {
  if (readWorkspaceSession(context.owner, "active") == null) return;
  const users = readActiveUsers();
  const usersById = users.ownerKey === ownerKey ? users.usersById : EMPTY_CALL_INVITE_USERS;
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
  MessengerRealtimeApplierOptions["onMessageReactionAggregateUpdated"]
> = (ownerKey, message, context) => {
  const getRuntimeContext = () => readWorkspaceSession(context.owner);
  const runtimeContext = getRuntimeContext();
  if (runtimeContext == null) return;
  createMessengerReactionAggregateRevalidateHandler({
    runtimeContext,
    getRuntimeContext,
    signal: context.signal,
  })(ownerKey, message);
};

// Only UI-specific effects depend on which authorized session is currently selected.
function currentSurface(owner: WorkspaceRealtimeRuntimeOwner): "active" | "background" {
  return useWorkspaceAuthStore.getState().currentAccountId === owner.accountId
    ? "active"
    : "background";
}

function createOwnerApplier(isOwnerCurrent: (owner: WorkspaceRealtimeRuntimeOwner) => boolean) {
  return createMessengerRealtimeApplier({
    isOwnerCurrent,
    onMessageCreated: ingestRealtimeCallInvite,
    onMessageDeleted: repairRealtimeDeletedMessagePointers,
    onMessageReactionAggregateUpdated: revalidateRealtimeOwnReactions,
  });
}

// A projection deletion belongs to the owner even if the screen selection changes during cleanup.
function bindExternalProjectionRemoval(
  isOwnerCurrent: (owner: WorkspaceRealtimeRuntimeOwner) => boolean,
) {
  return (streamUuid: string, context: WorkspaceRealtimeEventContext) =>
    removeMessengerStreamProjection({
      ownerKey: context.ownerKey,
      streamUuid,
      isOwnerCurrent: () => context.signal?.aborted !== true && isOwnerCurrent(context.owner),
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
        createExternalChatRealtimeApplier({
          surface: "active",
          isOwnerCurrent: isActive,
          removeProjection: bindExternalProjectionRemoval(isOwnerCurrent),
        }),
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
          removeProjection: bindExternalProjectionRemoval(isOwnerCurrent),
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
    return readActiveUser(runtimeContext.userUuid, ownerKey) ?? null;
  };
  return startWorkspacePresenceReporter({
    clientOptions: buildWorkspaceRequestOptions(runtimeContext),
    userUuid: runtimeContext.userUuid,
    getAccountStatus: () => readOwnUser()?.status ?? null,
    getStatusDecoration: () => workspaceStatusDecoration(readOwnUser()),
    onError: (error) => reportUnexpectedError("workspace-presence:report", error),
  });
}
