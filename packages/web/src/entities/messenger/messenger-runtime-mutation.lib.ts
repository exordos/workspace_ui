import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";

type MessengerRuntimeMutation<T> = (signal: AbortSignal) => Promise<T>;

const activeControllers = new Set<AbortController>();

function runtimeKey(context: WorkspaceRuntimeContext): string {
  return `${workspaceRuntimeOwnerKey(context)}\u0000${context.runtimeGeneration}`;
}

function currentRuntimeKey(): string | null {
  const context = useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
  return context == null ? null : runtimeKey(context);
}

let activeRuntimeKey = currentRuntimeKey();

function abortActiveMutations(): void {
  for (const controller of activeControllers) controller.abort();
  activeControllers.clear();
}

function synchronizeRuntime(): void {
  const nextRuntimeKey = currentRuntimeKey();
  if (nextRuntimeKey === activeRuntimeKey) return;

  abortActiveMutations();
  activeRuntimeKey = nextRuntimeKey;
}

function abortedMutationError(): Error {
  const error = new Error("The messenger runtime changed");
  error.name = "AbortError";
  return error;
}

export function runMessengerRuntimeMutation<T>(
  runtimeContext: WorkspaceRuntimeContext,
  mutation: MessengerRuntimeMutation<T>,
): Promise<T> {
  synchronizeRuntime();
  if (runtimeKey(runtimeContext) !== activeRuntimeKey) {
    return Promise.reject(abortedMutationError());
  }

  const controller = new AbortController();
  activeControllers.add(controller);

  const result = Promise.resolve().then(() => {
    if (controller.signal.aborted) throw abortedMutationError();
    return mutation(controller.signal);
  });

  const guardedResult = new Promise<T>((resolve, reject) => {
    const rejectForRuntimeChange = () => {
      const error = new Error("The messenger runtime changed");
      error.name = "AbortError";
      reject(error);
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

export function resetMessengerRuntimeMutations(): void {
  abortActiveMutations();
  activeRuntimeKey = currentRuntimeKey();
}

const unsubscribeAuth = useWorkspaceAuthStore.subscribe(synchronizeRuntime);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unsubscribeAuth();
    resetMessengerRuntimeMutations();
  });
}
