import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
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
  state: Pick<WorkspaceAuthState, "sessions" | "currentAccountId"> &
    Partial<Pick<WorkspaceAuthState, "reauthRequiredAccounts">>,
): WorkspaceSessionStorageScope {
  const account =
    selectCurrentWorkspaceRuntimeContext(state) ??
    state.reauthRequiredAccounts?.find((item) => item.accountId === state.currentAccountId);
  if (account == null) {
    return { ownerKey: null, legacyInstanceId: null };
  }
  return {
    ownerKey: workspaceRuntimeOwnerKey(account),
    legacyInstanceId: account.instanceId,
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
