import type { WorkspaceRuntimeContext } from "~/platform/sessions/workspace-runtime.types";
import type { WorkspaceClientOptions } from "~/shared/api/workspace-client";
import { useWorkspaceAuthStore } from "./workspace-auth.model";

// Request options that a caller can override for the selected API base.
export type WorkspaceRequestOptionsOverrides = Pick<
  WorkspaceClientOptions,
  "baseUrl" | "devTargetOrigin" | "fetchImpl" | "projectId"
>;

type RefreshSession = (
  accountId: string,
  options: { force?: boolean; signal?: AbortSignal },
) => Promise<unknown>;

const pendingForcedSessionRefreshes = new Map<string, Promise<void>>();

// Workspace and Messenger retry with the same in-flight forced refresh for the account.
async function refreshRequestSession(
  refreshSession: RefreshSession,
  accountId: string,
  options: { force?: boolean; signal?: AbortSignal },
): Promise<void> {
  if (options.force !== true) {
    await refreshSession(accountId, options);
    return;
  }

  const pending = pendingForcedSessionRefreshes.get(accountId);
  if (pending != null) {
    await pending;
    return;
  }

  const refreshPromise = refreshSession(accountId, options).then(() => undefined);
  pendingForcedSessionRefreshes.set(accountId, refreshPromise);
  try {
    await refreshPromise;
  } finally {
    if (pendingForcedSessionRefreshes.get(accountId) === refreshPromise) {
      pendingForcedSessionRefreshes.delete(accountId);
    }
  }
}

interface WorkspaceSessionRequestOptions {
  runtimeContext: WorkspaceRuntimeContext; // Account and project that own the request.
  refreshSession: RefreshSession; // Auth operation that refreshes that account's credentials.
  apiPath: string; // API path to append to the organization origin outside development.
  overrides?: WorkspaceRequestOptionsOverrides; // Explicit overrides from the caller.
  signal?: AbortSignal; // Default cancellation signal for the request and its refresh.
}

// Blank overrides use the default in the selected runtime.
function normalizeRequestOverride(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === "" ? undefined : trimmed;
}

// Build authenticated options for an API path with the captured runtime's credentials.
export function buildWorkspaceSessionRequestOptions({
  runtimeContext,
  refreshSession,
  apiPath,
  overrides,
  signal,
}: WorkspaceSessionRequestOptions): WorkspaceClientOptions {
  const { accountId, accessToken, organizationOrigin } = runtimeContext;
  const baseUrl = normalizeRequestOverride(overrides?.baseUrl);

  return {
    ...overrides,
    accessToken,
    baseUrl:
      baseUrl ??
      (import.meta.env.DEV ? undefined : `${organizationOrigin.replace(/\/+$/, "")}${apiPath}`),
    devTargetOrigin: normalizeRequestOverride(overrides?.devTargetOrigin) ?? organizationOrigin,
    getAccessToken: async ({ force = false, signal: tokenSignal } = {}) => {
      await refreshRequestSession(refreshSession, accountId, {
        force,
        signal: tokenSignal ?? signal,
      });
      return (
        useWorkspaceAuthStore.getState().sessions.find((session) => session.accountId === accountId)
          ?.accessToken ?? accessToken
      );
    },
    projectId: normalizeRequestOverride(overrides?.projectId) ?? runtimeContext.projectId,
    signal,
  };
}
