import { repairDeletedMessagePointers } from "~/applications/messenger/model/chats/messenger-deleted-message-pointer-repair.lib";
import { createMessengerReactionAggregateRevalidateHandler } from "~/applications/messenger/model/messages/messenger-message-reactions-actions.lib";
import { messengerRealtimeActiveCache } from "~/applications/messenger/model/messenger-cache.lib";
import { buildWorkspaceRequestOptions } from "~/applications/messenger/model/messenger-request-options.lib";
import {
  createMessengerRealtimeActiveApplier,
  createMessengerRealtimeBackgroundApplier,
  type MessengerRealtimeActiveApplierOptions,
} from "~/applications/messenger/runtime/sync/messenger-realtime-applier.lib";
import { createActivityRealtimeApplier } from "~/entities/activity/activity-realtime-applier.lib";
import { createExternalAccountRealtimeApplier } from "~/entities/external-account/external-account-realtime-applier.lib";
import { createExternalChatRealtimeApplier } from "~/entities/external-chat/external-chat-realtime-applier.lib";
import { workspaceStatusDecoration } from "~/entities/user/user-presence-status.lib";
import { createUserRealtimeApplier } from "~/entities/user/user-realtime-applier.lib";
import { selectUserDisplayName } from "~/entities/user/user-selectors.lib";
import { startWorkspacePresenceReporter } from "~/entities/user/user-workspace-presence-reporter.lib";
import { useUsersStore } from "~/entities/user/user.model";
import { ensureFreshWorkspaceSession } from "~/entities/workspace-auth/workspace-auth.lib";
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
  runtimeContext: WorkspaceRuntimeContext,
): WorkspaceSessionContext {
  const { accountId, instanceId, organizationId, projectId, userUuid, runtimeGeneration } =
    runtimeContext;
  return {
    owner: { accountId, instanceId, organizationId, projectId, userUuid, runtimeGeneration },
    ownerKey: workspaceRuntimeOwnerKey(runtimeContext),
    runtimeKey: [runtimeContext.organizationOrigin, runtimeContext.accessToken].join("\u0000"),
    runtimeContext,
  };
}

// Repair loaded catalog pointers through the owning model after a message is removed.
const repairRealtimeDeletedMessagePointers: NonNullable<
  MessengerRealtimeActiveApplierOptions["onMessageDeleted"]
> = (_ownerKey, _message, plan, context, isCurrent) => {
  const getRuntimeContext = () => readWorkspaceSession(context.owner, "active");
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

// Resolve the current active scope at event time instead of closing over a selected account.
const revalidateRealtimeOwnReactions: NonNullable<
  MessengerRealtimeActiveApplierOptions["onMessageReactionAggregateUpdated"]
> = (ownerKey, message, context) => {
  const getRuntimeContext = () => readWorkspaceSession(context.owner, "active");
  const runtimeContext = getRuntimeContext();
  if (runtimeContext == null) return;
  createMessengerReactionAggregateRevalidateHandler({
    runtimeContext,
    getRuntimeContext,
    signal: context.signal,
  })(ownerKey, message);
};

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
          prepareWorkspaceSessionSnapshots(context, preparation, () =>
            isOwnerCurrent(context.owner),
          ),
        prepareParticipant: (context, participant) =>
          prepareWorkspaceSessionParticipant(context, participant, () =>
            isOwnerCurrent(context.owner),
          ),
        onDiagnostic,
      }),
    activeApplierFactory: ({ isOwnerCurrent }) => {
      const isActive = (owner: WorkspaceRealtimeRuntimeOwner) =>
        isOwnerCurrent(owner) && readWorkspaceSession(owner, "active") != null;
      return composeWorkspaceRealtimeAppliers([
        createActivityRealtimeApplier({ isOwnerCurrent: isActive }),
        createExternalAccountRealtimeApplier({ surface: "active", isOwnerCurrent: isActive }),
        createExternalChatRealtimeApplier({ surface: "active", isOwnerCurrent: isActive }),
        createMessengerRealtimeActiveApplier({
          isOwnerCurrent: isActive,
          requireActiveCatalog: true,
          onMessageCreated: ingestRealtimeCallInvite,
          onMessageDeleted: repairRealtimeDeletedMessagePointers,
          onMessageReactionAggregateUpdated: revalidateRealtimeOwnReactions,
        }),
        createUserRealtimeApplier({ isOwnerCurrent: isActive, requireActiveProjection: true }),
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
        createExternalChatRealtimeApplier({ surface: "background", isOwnerCurrent: isBackground }),
        createMessengerRealtimeBackgroundApplier({ isOwnerCurrent: isBackground }),
        createUserRealtimeApplier({ isOwnerCurrent: isBackground }),
      ]);
    },
    isOwnerCurrent(owner, surface, { runtimeContext }) {
      const current = readWorkspaceSession(owner, surface);
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
