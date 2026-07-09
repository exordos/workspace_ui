import { getCurrentWorkspaceSessionStorageScope } from "~/entities/workspace-auth/workspace-session-storage-scope.lib";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { configureI18nStorageScope } from "~/i18n/i18n";
import type { I18nStorageScope } from "~/i18n/i18n";

function getWorkspaceI18nStorageScope(): I18nStorageScope {
  const scope = getCurrentWorkspaceSessionStorageScope();
  return {
    scopeKey: scope.ownerKey,
    legacyScopeKey: scope.legacyInstanceId,
  };
}

export function configureWorkspaceI18nStorageScope(): void {
  configureI18nStorageScope({
    getScope: getWorkspaceI18nStorageScope,
    subscribe: (onScopeChange) =>
      useWorkspaceAuthStore.subscribe(() => {
        onScopeChange();
      }),
  });
}
