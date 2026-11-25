import { buildWorkspaceSessionRequestOptions } from "~/entities/workspace-auth/workspace-auth-request-options.lib";
import type { WorkspaceRequestOptionsOverrides } from "~/entities/workspace-auth/workspace-auth-request-options.lib";
import { ensureFreshWorkspaceSession } from "~/entities/workspace-auth/workspace-auth.lib";
import type { WorkspaceRuntimeContext } from "~/platform/sessions/workspace-runtime.types";
import type { MessengerClientOptions } from "~/shared/api/messenger-client";

// Request overrides supported by the Messenger client.
export type MessengerRequestOptionsOverrides = WorkspaceRequestOptionsOverrides;

// Build authenticated options for the Messenger API of the given Workspace runtime.
export function buildMessengerRequestOptions(
  runtimeContext: WorkspaceRuntimeContext,
  overrides?: MessengerRequestOptionsOverrides,
  signal?: AbortSignal,
): MessengerClientOptions {
  return buildWorkspaceSessionRequestOptions({
    runtimeContext,
    refreshSession: ensureFreshWorkspaceSession,
    apiPath: "/api/workspace/v1/messenger",
    overrides,
    signal,
  });
}
