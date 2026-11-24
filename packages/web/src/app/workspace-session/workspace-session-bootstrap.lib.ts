import {
  invalidateMessengerSessionProtectedResources,
  markMessengerSessionBootstrapError,
  prepareMessengerSessionSnapshot,
  restoreMessengerSessionCatalog,
} from "~/applications/messenger/runtime/sync/messenger-session-snapshot.lib";
import { useActivityStore } from "~/entities/activity/activity.model";
import { loadExternalAccounts } from "~/entities/external-account/external-account-loader.lib";
import { invalidateExternalChatsForOwner } from "~/entities/external-chat/external-chat.model";
import {
  buildWorkspaceRequestOptions,
  ensureFreshWorkspaceSession,
} from "~/entities/workspace-auth/workspace-auth.lib";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { isWorkspaceRuntimeRequestContextCurrent } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import {
  refreshWorkspaceSessionUsers,
  restoreWorkspaceSessionUsers,
} from "~/modules/users/users-runtime";
import { getEpoch } from "~/shared/api/workspace-client";
import type { WorkspaceRealtimeCursor } from "~/shared/lib/workspace-realtime/workspace-realtime-cursor.lib";
import type {
  WorkspaceRealtimeRuntimeContext,
  WorkspaceRealtimeRuntimeOptions,
  WorkspaceRealtimeRuntimeOwner,
} from "~/shared/lib/workspace-realtime/workspace-realtime-runtime.lib";

const CACHE_RESUME_WAIT_MS = 150; // A blocked IDB read must not hold network startup.

// Reject a saved baseline as soon as one participant cannot restore it.
function waitForRestoredBaseline(checks: readonly Promise<boolean>[]): Promise<boolean> {
  return new Promise((resolve) => {
    let remaining = checks.length;
    const timer = setTimeout(() => resolve(false), CACHE_RESUME_WAIT_MS);
    for (const check of checks) {
      void check.then((ready) => {
        remaining -= 1;
        if (ready && remaining > 0) return;
        clearTimeout(timer);
        resolve(ready);
      });
    }
  });
}

// Read the current authorization and optionally require the same projection surface.
export function readWorkspaceSession(
  owner: WorkspaceRealtimeRuntimeOwner,
  surface?: WorkspaceRealtimeRuntimeContext["surface"],
): WorkspaceRuntimeContext | null {
  const { getRuntimeContextForOwner, currentAccountId } = useWorkspaceAuthStore.getState();
  if (surface != null && (owner.accountId === currentAccountId) !== (surface === "active")) {
    return null;
  }
  const session = getRuntimeContextForOwner(owner);
  return isWorkspaceRuntimeRequestContextCurrent(owner, () => session) ? session : null;
}

// Convert a participant's snapshot result into the session's completion contract.
function requireSnapshot(result: { status: string; error?: string }): void {
  if (result.status === "skipped") {
    throw new DOMException("Workspace session changed during snapshot preparation", "AbortError");
  }
  if (result.status !== "applied") throw new Error(result.error ?? "Workspace snapshot failed");
}

// Prepare a safe journal boundary for this owner and this attempt.
export async function prepareWorkspaceSessionSnapshots(
  context: WorkspaceRealtimeRuntimeContext,
  {
    savedCursor,
    resetRequired,
  }: Parameters<NonNullable<WorkspaceRealtimeRuntimeOptions["prepareSnapshots"]>>[1],
  isTransportCurrent: () => boolean = () => true,
): Promise<WorkspaceRealtimeCursor> {
  const { owner, ownerKey, surface, signal } = context;
  const getRuntimeContext = () => (isTransportCurrent() ? readWorkspaceSession(owner) : null);
  const isCurrent = () => signal?.aborted !== true && getRuntimeContext() != null;
  const requireCurrent = () => {
    if (!isCurrent()) {
      throw new DOMException("Workspace snapshot attempt canceled", "AbortError");
    }
  };
  const runtimeContext = getRuntimeContext();
  if (runtimeContext == null) {
    throw new DOMException("Workspace session unavailable", "AbortError");
  }
  requireCurrent();
  const scope = { runtimeContext, getRuntimeContext, signal, surface };
  const useCachedSnapshots = !resetRequired;
  if (resetRequired) invalidateMessengerSessionProtectedResources(scope);
  const usersRestore = useCachedSnapshots
    ? restoreWorkspaceSessionUsers(scope).catch(() => undefined)
    : Promise.resolve(undefined);
  const messengerRestore = useCachedSnapshots
    ? restoreMessengerSessionCatalog(scope).catch(() => undefined)
    : Promise.resolve(undefined);

  await ensureFreshWorkspaceSession(owner.accountId, { signal });
  requireCurrent();
  if (savedCursor != null && useCachedSnapshots) {
    const canResume = await waitForRestoredBaseline([
      usersRestore.then((result) => result?.status === "applied"),
      messengerRestore.then((result) => result === "restored"),
    ]);
    requireCurrent();
    if (canResume) return savedCursor;
  }

  let epoch: Awaited<ReturnType<typeof getEpoch>>;
  try {
    epoch = await getEpoch(buildWorkspaceRequestOptions(runtimeContext, undefined, signal));
  } catch (error) {
    if (isCurrent()) markMessengerSessionBootstrapError(scope, error);
    throw error;
  }
  requireCurrent();
  if (resetRequired && readWorkspaceSession(owner, "active") != null) {
    invalidateExternalChatsForOwner(ownerKey);
    useActivityStore.getState().invalidateUnreadMentions(ownerKey);
  }

  // Neither participant awaits the other. The fresh cursor is the only shared barrier.
  const requiredSnapshots = [
    refreshWorkspaceSessionUsers({ ...scope, reset: resetRequired }).then(requireSnapshot),
    prepareMessengerSessionSnapshot({ ...scope, reset: resetRequired }).then(requireSnapshot),
  ];
  if (resetRequired) {
    requiredSnapshots.push(
      loadExternalAccounts({
        ...scope,
        surface: "background",
        restoreCache: false,
        publishIfSelected: () => readWorkspaceSession(owner, "active") != null,
      }).then(requireSnapshot),
    );
  }
  const results = await Promise.allSettled(requiredSnapshots);
  requireCurrent();
  const failure = results.find((result) => result.status === "rejected");
  if (failure != null) throw failure.reason;

  if (!resetRequired && readWorkspaceSession(owner, "active") != null) {
    useActivityStore.getState().invalidateUnreadMentions(ownerKey);
  }
  return { epochGeneration: epoch.epoch_generation, epochVersion: epoch.epoch_version };
}

// Repair the participant that rejected the next event without replacing the journal boundary.
export async function prepareWorkspaceSessionParticipant(
  context: WorkspaceRealtimeRuntimeContext,
  participant: string,
  isTransportCurrent: () => boolean,
): Promise<void> {
  const { owner, signal, surface } = context;
  const getRuntimeContext = () => (isTransportCurrent() ? readWorkspaceSession(owner) : null);
  const runtimeContext = getRuntimeContext();
  if (runtimeContext == null || signal?.aborted === true) {
    throw new DOMException("Workspace participant attempt canceled", "AbortError");
  }
  const scope = { runtimeContext, getRuntimeContext, signal, surface };
  if (participant === "users") {
    requireSnapshot(await refreshWorkspaceSessionUsers(scope));
  } else if (participant === "messenger") {
    requireSnapshot(await prepareMessengerSessionSnapshot(scope));
  } else {
    throw new Error("Unknown Workspace realtime participant");
  }
}
