import type {
  WorkspaceRuntimeContext,
  WorkspaceRuntimeOwner,
  WorkspaceRuntimeRequestContext,
} from "./workspace-runtime.types";

export type WorkspaceRuntimeContextGetter = () => WorkspaceRuntimeContext | null;

// Capture the current owner before an async request starts.
export function captureWorkspaceRuntimeRequestContext(
  getContext: WorkspaceRuntimeContextGetter,
): WorkspaceRuntimeRequestContext | null {
  const context = getContext();
  if (context == null) return null;

  return {
    accountId: context.accountId,
    instanceId: context.instanceId,
    organizationId: context.organizationId,
    projectId: context.projectId,
    userUuid: context.userUuid,
    runtimeGeneration: context.runtimeGeneration,
  };
}

// Stores and caches use this key to stay scoped to one account/project/user.
export function workspaceRuntimeOwnerKey(owner: WorkspaceRuntimeOwner): string {
  return [
    "account",
    owner.accountId,
    "instance",
    owner.instanceId,
    "organization",
    owner.organizationId,
    "project",
    owner.projectId,
    "user",
    owner.userUuid,
  ].join(":");
}

// The realtime cursor must be separate for each runtime owner.
export function workspaceRuntimeCursorKey(owner: WorkspaceRuntimeOwner): string {
  return `${workspaceRuntimeOwnerKey(owner)}:cursor`;
}

// A request is current only if the owner and generation still match.
export function isWorkspaceRuntimeRequestContextCurrent(
  requestContext: WorkspaceRuntimeRequestContext | null,
  getContext: WorkspaceRuntimeContextGetter,
): boolean {
  if (requestContext == null) return false;

  const current = getContext();
  if (current == null) return false;

  return (
    current.accountId === requestContext.accountId &&
    current.instanceId === requestContext.instanceId &&
    current.organizationId === requestContext.organizationId &&
    current.projectId === requestContext.projectId &&
    current.userUuid === requestContext.userUuid &&
    current.runtimeGeneration === requestContext.runtimeGeneration
  );
}

export function isWorkspaceRuntimeRequestInvalidated(
  requestContext: WorkspaceRuntimeRequestContext | null,
  getContext: WorkspaceRuntimeContextGetter,
  signal?: AbortSignal,
): boolean {
  return (
    signal?.aborted === true || !isWorkspaceRuntimeRequestContextCurrent(requestContext, getContext)
  );
}
