/**
 * Injectable HTTP layer for Orval-generated Workspace API calls.
 *
 * The web app registers `setWorkspaceApiMutator` with an implementation
 * that delegates to `workspaceApi` (auth, logging, retries).
 *
 * The second argument matches what Orval passes (spread `RequestInit` + `method`).
 */

export type WorkspaceMutatorInit = RequestInit;

export type WorkspaceMutatorFn = <T>(url: string, init: WorkspaceMutatorInit) => Promise<T>;

let impl: WorkspaceMutatorFn | null = null;

/** Called once at app bootstrap (e.g. main.tsx) before any Workspace API usage. */
export function setWorkspaceApiMutator(next: WorkspaceMutatorFn): void {
  impl = next;
}

/**
 * Orval custom instance — must match the name in `orval.config.ts` (`customInstance`).
 * Returns parsed JSON body; callers handle HTTP errors via thrown errors or response typing.
 */
export async function customInstance<T>(url: string, init: WorkspaceMutatorInit): Promise<T> {
  if (!impl) {
    throw new Error(
      "Workspace API mutator not configured: call setWorkspaceApiMutator() during app init",
    );
  }
  return impl<T>(url, init);
}
