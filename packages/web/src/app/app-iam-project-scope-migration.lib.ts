/** Startup migration for IAM sessions persisted before the canonical project scope was pinned. */
import { WORKSPACE_IAM_PROJECT_SCOPE_VERSION } from "~/shared/config/workspace-project";

export interface PersistedIamSessionScopeState {
  id: string;
  iamProjectScopeVersion?: number;
  iamRefreshToken?: string;
}

export interface IamProjectScopeMigrationOptions {
  instances: readonly PersistedIamSessionScopeState[];
  refreshInstance: (instance: PersistedIamSessionScopeState) => Promise<boolean>;
  removeInstance: (instanceId: string) => void;
}

export interface IamProjectScopeMigrationResult {
  failedInstanceIds: string[];
  migratedInstanceIds: string[];
  removedInstanceIds: string[];
}

export function hasCurrentWorkspaceIamProjectScope(
  instance: PersistedIamSessionScopeState,
): boolean {
  return instance.iamProjectScopeVersion === WORKSPACE_IAM_PROJECT_SCOPE_VERSION;
}

export async function migratePersistedIamSessionsToCurrentProject(
  options: IamProjectScopeMigrationOptions,
): Promise<IamProjectScopeMigrationResult> {
  const result: IamProjectScopeMigrationResult = {
    failedInstanceIds: [],
    migratedInstanceIds: [],
    removedInstanceIds: [],
  };

  for (const instance of options.instances) {
    if (hasCurrentWorkspaceIamProjectScope(instance)) continue;

    const refreshToken = instance.iamRefreshToken?.trim() ?? "";
    if (refreshToken.length === 0) {
      options.removeInstance(instance.id);
      result.removedInstanceIds.push(instance.id);
      continue;
    }

    if (await options.refreshInstance(instance)) {
      result.migratedInstanceIds.push(instance.id);
    } else {
      result.failedInstanceIds.push(instance.id);
    }
  }

  return result;
}
