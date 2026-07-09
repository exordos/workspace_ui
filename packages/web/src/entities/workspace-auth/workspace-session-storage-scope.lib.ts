import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeOwner } from "~/entities/workspace-runtime/workspace-runtime.types";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
  type WorkspaceAuthState,
} from "./workspace-auth.model";

export interface WorkspaceSessionStorageScope {
  ownerKey: string | null;
  legacyInstanceId: string | null;
}

export function getWorkspaceSessionStorageScopeFromAuthState(
  state: Pick<WorkspaceAuthState, "sessions" | "currentAccountId">,
): WorkspaceSessionStorageScope {
  const runtimeContext = selectCurrentWorkspaceRuntimeContext(state);
  if (runtimeContext == null) {
    return { ownerKey: null, legacyInstanceId: null };
  }

  const owner: WorkspaceRuntimeOwner = {
    accountId: runtimeContext.accountId,
    instanceId: runtimeContext.instanceId,
    organizationId: runtimeContext.organizationId,
    projectId: runtimeContext.projectId,
    userUuid: runtimeContext.userUuid,
  };

  return {
    ownerKey: workspaceRuntimeOwnerKey(owner),
    legacyInstanceId: runtimeContext.instanceId,
  };
}

export function getCurrentWorkspaceSessionStorageScope(): WorkspaceSessionStorageScope {
  return getWorkspaceSessionStorageScopeFromAuthState(useWorkspaceAuthStore.getState());
}

export function buildWorkspaceSessionStorageKey(
  baseKey: string,
  scope: WorkspaceSessionStorageScope = getCurrentWorkspaceSessionStorageScope(),
): string {
  if (scope.ownerKey == null || scope.ownerKey.length === 0) {
    return baseKey;
  }
  return `${baseKey}:${scope.ownerKey}`;
}

export function buildLegacyWorkspaceSessionStorageKey(
  baseKey: string,
  scope: WorkspaceSessionStorageScope = getCurrentWorkspaceSessionStorageScope(),
): string | null {
  if (scope.legacyInstanceId == null || scope.legacyInstanceId.length === 0) {
    return null;
  }
  return `${baseKey}:${scope.legacyInstanceId}`;
}
