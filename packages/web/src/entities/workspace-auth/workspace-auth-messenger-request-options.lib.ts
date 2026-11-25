import type { WorkspaceRuntimeContext } from "~/platform/sessions/workspace-runtime.types";
import type { MessengerClientOptions } from "~/shared/api/messenger-client";
import { buildWorkspaceSessionRequestOptions } from "./workspace-auth-request-options.lib";
import { ensureFreshWorkspaceSession } from "./workspace-auth.lib";
import type { WorkspaceRequestOptionsOverrides } from "./workspace-auth-request-options.lib";

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
