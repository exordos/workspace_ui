import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type { MessengerClientOptions } from "~/shared/api/messenger-client";

export type MessengerRequestOptionsOverrides = Pick<
  MessengerClientOptions,
  "baseUrl" | "devTargetOrigin" | "fetchImpl" | "projectId"
>;

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
    projectId: projectId != null && projectId.length > 0 ? projectId : runtimeContext.projectId,
    signal,
  };
}
