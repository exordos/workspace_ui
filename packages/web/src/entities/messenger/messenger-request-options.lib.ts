import { ensureFreshWorkspaceSession } from "~/entities/workspace-auth/workspace-auth.lib";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type { MessengerClientOptions } from "~/shared/api/messenger-client";
import type { WorkspaceClientOptions } from "~/shared/api/workspace-client";

export type MessengerRequestOptionsOverrides = Pick<
  MessengerClientOptions,
  "baseUrl" | "devTargetOrigin" | "fetchImpl" | "projectId"
>;

export type WorkspaceRequestOptionsOverrides = Pick<
  WorkspaceClientOptions,
  "baseUrl" | "devTargetOrigin" | "fetchImpl" | "projectId"
>;

const pendingForcedSessionRefreshes = new Map<string, Promise<void>>();

function messengerBaseUrlForOrganizationOrigin(origin: string): string {
  return `${origin.replace(/\/+$/, "")}/api/workspace/v1/messenger`;
}

function workspaceBaseUrlForOrganizationOrigin(origin: string): string {
  return `${origin.replace(/\/+$/, "")}/api/workspace/v1`;
}

function runtimeMessengerBaseUrl(
  runtimeContext: WorkspaceRuntimeContext,
  overrideBaseUrl: string | undefined,
): string | undefined {
  const baseUrl = overrideBaseUrl?.trim();
  if (baseUrl != null && baseUrl.length > 0) {
    return baseUrl;
  }
  if (import.meta.env.DEV) {
    return undefined;
  }
  return messengerBaseUrlForOrganizationOrigin(runtimeContext.organizationOrigin);
}

function runtimeWorkspaceBaseUrl(
  runtimeContext: WorkspaceRuntimeContext,
  overrideBaseUrl: string | undefined,
): string | undefined {
  const baseUrl = overrideBaseUrl?.trim();
  if (baseUrl != null && baseUrl.length > 0) {
    return baseUrl;
  }
  if (import.meta.env.DEV) {
    return undefined;
  }
  return workspaceBaseUrlForOrganizationOrigin(runtimeContext.organizationOrigin);
}

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
  const baseUrl = runtimeMessengerBaseUrl(runtimeContext, overrides?.baseUrl);

  return {
    ...overrides,
    accessToken: runtimeContext.accessToken,
    baseUrl,
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

export function buildWorkspaceRequestOptions(
  runtimeContext: WorkspaceRuntimeContext,
  overrides?: WorkspaceRequestOptionsOverrides,
  signal?: AbortSignal,
): WorkspaceClientOptions {
  const projectId = overrides?.projectId?.trim();
  const devTargetOrigin = overrides?.devTargetOrigin?.trim();
  const baseUrl = runtimeWorkspaceBaseUrl(runtimeContext, overrides?.baseUrl);

  return {
    ...overrides,
    accessToken: runtimeContext.accessToken,
    baseUrl,
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
