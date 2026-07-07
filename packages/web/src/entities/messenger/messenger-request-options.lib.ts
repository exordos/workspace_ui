import { ensureFreshWorkspaceSession } from "~/entities/workspace-auth/workspace-auth.lib";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type { MessengerClientOptions } from "~/shared/api/messenger-client";

export type MessengerRequestOptionsOverrides = Pick<
  MessengerClientOptions,
  "baseUrl" | "devTargetOrigin" | "fetchImpl" | "projectId"
>;

const pendingForcedSessionRefreshes = new Map<string, Promise<void>>();

function findSessionAccessToken(accountId: string): string | null {
  return (
    useWorkspaceAuthStore.getState().sessions.find((session) => session.accountId === accountId)
      ?.accessToken ?? null
  );
}

async function ensureMessengerSessionAccessToken(
  accountId: string,
  options: { force?: boolean; signal?: AbortSignal },
): Promise<void> {
  if (options.force !== true) {
    await ensureFreshWorkspaceSession(accountId, options);
    return;
  }

  const pending = pendingForcedSessionRefreshes.get(accountId);
  if (pending != null) {
    await pending;
    return;
  }

  const refreshPromise = ensureFreshWorkspaceSession(accountId, options).then(() => undefined);
  pendingForcedSessionRefreshes.set(accountId, refreshPromise);
  try {
    await refreshPromise;
  } finally {
    if (pendingForcedSessionRefreshes.get(accountId) === refreshPromise) {
      pendingForcedSessionRefreshes.delete(accountId);
    }
  }
}

export function buildMessengerRequestOptions(
  runtimeContext: WorkspaceRuntimeContext,
  overrides?: MessengerRequestOptionsOverrides,
  signal?: AbortSignal,
): MessengerClientOptions {
  const projectId = overrides?.projectId?.trim();
  const devTargetOrigin = overrides?.devTargetOrigin?.trim();

  return {
    ...overrides,
    accessToken: runtimeContext.accessToken,
    devTargetOrigin:
      devTargetOrigin != null && devTargetOrigin.length > 0
        ? devTargetOrigin
        : runtimeContext.organizationOrigin,
    getAccessToken: async ({ force = false, signal: tokenSignal } = {}) => {
      await ensureMessengerSessionAccessToken(runtimeContext.accountId, {
        force,
        signal: tokenSignal ?? signal,
      });
      return findSessionAccessToken(runtimeContext.accountId) ?? runtimeContext.accessToken;
    },
    projectId: projectId != null && projectId.length > 0 ? projectId : runtimeContext.projectId,
    signal,
  };
}
