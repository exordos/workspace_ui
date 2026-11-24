import {
  useWorkspaceAuthStore,
  workspaceAuthSessionIncarnation,
} from "~/entities/workspace-auth/workspace-auth.model";
import {
  isWorkspaceRuntimeRequestContextCurrent,
  workspaceRuntimeOwnerKey,
  type WorkspaceRuntimeContextGetter,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { disposeChatCryptoOwner } from "./crypto/chat-crypto-session.lib";
import { disposeWorkspaceDraftSyncOwner } from "./drafts/composer-draft-sync.lib";
import { disposeWorkspaceDraftOwner } from "./drafts/composer-draft.model";
import { useMessengerOutboxStore } from "./messages/outgoing/messenger-outbox.model";

type MessengerRuntimeMutation<T> = (signal: AbortSignal) => Promise<T>;

const activeControllers = new Map<AbortController, () => boolean>();
const ownerDisposals = new Map<string, Promise<void>>();

function abortActiveMutations(): void {
  for (const controller of activeControllers.keys()) controller.abort();
  activeControllers.clear();
}

function synchronizeRuntime(): void {
  for (const [controller, isCurrent] of activeControllers) {
    if (!isCurrent()) controller.abort();
  }
}

function abortedMutationError(): Error {
  const error = new Error("The messenger runtime changed");
  error.name = "AbortError";
  return error;
}

function runBoundMutation<T>(
  runtimeContext: WorkspaceRuntimeContext,
  getRuntimeContext: WorkspaceRuntimeContextGetter,
  mutation: MessengerRuntimeMutation<T>,
): Promise<T> {
  const isCurrent = () =>
    isWorkspaceRuntimeRequestContextCurrent(runtimeContext, getRuntimeContext);
  if (!isCurrent()) return Promise.reject(abortedMutationError());
  const controller = new AbortController();
  activeControllers.set(controller, isCurrent);

  const result = Promise.resolve().then(() => {
    if (controller.signal.aborted || !isCurrent()) throw abortedMutationError();
    return mutation(controller.signal);
  });

  const guardedResult = new Promise<T>((resolve, reject) => {
    const rejectForRuntimeChange = () => {
      reject(abortedMutationError());
    };
    controller.signal.addEventListener("abort", rejectForRuntimeChange, { once: true });
    if (controller.signal.aborted) rejectForRuntimeChange();
    void result.then(resolve, reject);

    const removeAbortListener = () => {
      controller.signal.removeEventListener("abort", rejectForRuntimeChange);
    };
    void result.then(removeAbortListener, removeAbortListener);
  });

  return guardedResult.finally(() => {
    activeControllers.delete(controller);
  });
}

// Mutations started by a screen retain the selected generation check.
export function runMessengerRuntimeMutation<T>(
  runtimeContext: WorkspaceRuntimeContext,
  mutation: MessengerRuntimeMutation<T>,
): Promise<T> {
  return runBoundMutation(
    runtimeContext,
    useWorkspaceAuthStore.getState().getCurrentRuntimeContext,
    mutation,
  );
}

// An accepted delivery belongs to its authorized owner even when another account is selected.
export function runMessengerOwnerMutation<T>(
  runtimeContext: WorkspaceRuntimeContext,
  mutation: MessengerRuntimeMutation<T>,
): Promise<T> {
  return runBoundMutation(
    runtimeContext,
    () => useWorkspaceAuthStore.getState().getRuntimeContextForOwner(runtimeContext),
    mutation,
  );
}

// Revoke owner-only Messenger work synchronously and drain already scheduled local writes.
async function disposeMessengerOwnerWork(ownerKey: string): Promise<void> {
  disposeChatCryptoOwner(ownerKey);
  disposeWorkspaceDraftSyncOwner(ownerKey);
  useMessengerOutboxStore.getState().clearOwner(ownerKey);
  return disposeWorkspaceDraftOwner(ownerKey);
}

// Durable deletion waits for detached draft operations without detaching a later login.
export function waitForMessengerOwnerDisposal(ownerKey: string): Promise<void> {
  return ownerDisposals.get(ownerKey) ?? Promise.resolve();
}

export function resetMessengerRuntimeMutations(): void {
  abortActiveMutations();
}

// Revoke transient Messenger work while the cold-start reset deletes its local storage.
export function quiesceMessengerOwnerWorkForColdStart(): void {
  abortActiveMutations();
  for (const session of useWorkspaceAuthStore.getState().sessions) {
    // The database reset closes both the existing connection and access to new connections.
    void disposeMessengerOwnerWork(workspaceRuntimeOwnerKey(session)).catch(() => undefined);
  }
}

const unsubscribeAuth = useWorkspaceAuthStore.subscribe((state, previous) => {
  synchronizeRuntime();
  if (state.sessions === previous.sessions) return;
  for (const old of previous.sessions) {
    const current = state.getRuntimeContextForOwner(old);
    if (
      current != null &&
      workspaceAuthSessionIncarnation(current) === workspaceAuthSessionIncarnation(old)
    )
      continue;
    const ownerKey = workspaceRuntimeOwnerKey(old);
    const disposal = disposeMessengerOwnerWork(ownerKey);
    ownerDisposals.set(ownerKey, disposal);
    void disposal
      .finally(() => {
        if (ownerDisposals.get(ownerKey) === disposal) ownerDisposals.delete(ownerKey);
      })
      .catch(() => undefined);
  }
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unsubscribeAuth();
    resetMessengerRuntimeMutations();
  });
}
