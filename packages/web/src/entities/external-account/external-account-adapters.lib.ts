import type { WorkspaceExternalAccountDto } from "~/shared/api/messenger-external-accounts.types";
import type { WorkspaceExternalAccountCacheProfile } from "~/shared/lib/workspace-external-account-cache-db";
import type { ExternalAccount, ExternalAccountProvider } from "./external-account.types";

export function adaptWorkspaceExternalAccountDto(
  dto: WorkspaceExternalAccountDto,
  etag = `"${dto.revision}"`,
): ExternalAccount {
  return {
    uuid: dto.uuid,
    provider: dto.settings.kind,
    settings: {
      kind: dto.settings.kind,
      serverUrl: dto.settings.server_url,
      email: dto.settings.email,
      selectionMode: dto.settings.selection_mode,
      historyDepth: dto.settings.history_depth,
      defaultProjectId: dto.settings.default_project_id,
    },
    credentialPresent: dto.credential_present,
    status: dto.status,
    liveReady: dto.live_ready,
    capabilities: { ...dto.capabilities },
    safeError: dto.safe_error,
    desiredGeneration: dto.desired_generation,
    appliedGeneration: dto.applied_generation,
    lastProgressAt: dto.last_progress_at,
    revision: dto.revision,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
    etag,
  };
}

export function isExternalAccountDuplicate(
  accounts: readonly ExternalAccount[],
  provider: ExternalAccountProvider,
): boolean {
  return accounts.some((account) => account.provider === provider);
}

export function toWorkspaceExternalAccountCacheProfile(
  account: ExternalAccount,
): WorkspaceExternalAccountCacheProfile {
  return {
    ...account,
    settings: { ...account.settings },
    capabilities: { ...account.capabilities },
  };
}

export function adaptCachedExternalAccount(
  account: WorkspaceExternalAccountCacheProfile,
): ExternalAccount {
  return {
    ...account,
    settings: { ...account.settings },
    capabilities: { ...account.capabilities },
  };
}
