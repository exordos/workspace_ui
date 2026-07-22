import type { WorkspaceExternalAccountDto } from "~/shared/api/messenger-external-accounts.types";
import type { WorkspaceExternalAccountCacheProfile } from "~/shared/lib/workspace-external-account-cache-db";
import type { ExternalAccount, ExternalAccountType } from "./external-account.types";

export function adaptWorkspaceExternalAccountDto(
  dto: WorkspaceExternalAccountDto,
): ExternalAccount {
  return {
    uuid: dto.uuid,
    serverUrl: dto.settings.server_url,
    email: dto.settings.email,
    accountType: dto.settings.kind,
    selectionMode: dto.settings.selection_mode,
    historyDepth: dto.settings.history_depth,
    defaultProjectId: dto.settings.default_project_id,
    credentialPresent: dto.credential_present,
    status: dto.status,
    liveReady: dto.live_ready,
    capabilities: dto.capabilities,
    safeError: dto.safe_error,
    desiredGeneration: dto.desired_generation,
    appliedGeneration: dto.applied_generation,
    lastProgressAt: dto.last_progress_at,
    revision: dto.revision,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  };
}

export function isExternalAccountDuplicate(
  accounts: readonly ExternalAccount[],
  accountType: ExternalAccountType,
): boolean {
  return accounts.some((account) => account.accountType === accountType);
}

export function toWorkspaceExternalAccountCacheProfile(
  account: ExternalAccount,
): WorkspaceExternalAccountCacheProfile {
  return { ...account };
}

export function adaptCachedExternalAccount(
  account: WorkspaceExternalAccountCacheProfile,
): ExternalAccount {
  return { ...account };
}
