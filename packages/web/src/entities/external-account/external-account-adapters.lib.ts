import type { WorkspaceExternalAccountDto } from "~/shared/api/messenger-external-accounts.types";
import type { WorkspaceExternalAccountCacheProfile } from "~/shared/lib/workspace-external-account-cache-db";
import type { ExternalAccount, ExternalAccountProvider } from "./external-account.types";

export function adaptWorkspaceExternalAccountDto(
  dto: WorkspaceExternalAccountDto,
  etag = dto.revision == null ? undefined : `"${dto.revision}"`,
): ExternalAccount {
  const provider = "provider" in dto ? dto.provider : dto.settings.kind;
  const account = {
    uuid: dto.uuid,
    provider,
    settings: {
      kind: provider,
      ...(dto.settings.server_url === undefined ? {} : { serverUrl: dto.settings.server_url }),
      ...(dto.settings.email === undefined ? {} : { email: dto.settings.email }),
      ...(dto.settings.selection_mode === undefined
        ? {}
        : { selectionMode: dto.settings.selection_mode }),
      ...(dto.settings.history_depth === undefined
        ? {}
        : { historyDepth: dto.settings.history_depth }),
      ...(dto.settings.default_project_id === undefined
        ? {}
        : { defaultProjectId: dto.settings.default_project_id }),
    },
    status: dto.status,
    revision: dto.revision,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
    etag,
  };
  if ("provider" in dto) {
    return { ...account, provider: dto.provider, safeError: dto.error_description ?? null };
  }
  return {
    ...account,
    credentialPresent: dto.credential_present,
    liveReady: dto.live_ready,
    capabilities: { ...dto.capabilities },
    safeError: dto.safe_error,
    desiredGeneration: dto.desired_generation,
    appliedGeneration: dto.applied_generation,
    lastProgressAt: dto.last_progress_at,
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
    ...(account.capabilities == null ? {} : { capabilities: { ...account.capabilities } }),
  };
}

export function adaptCachedExternalAccount(
  account: WorkspaceExternalAccountCacheProfile,
): ExternalAccount {
  return {
    ...account,
    settings: { ...account.settings },
    ...(account.capabilities == null ? {} : { capabilities: { ...account.capabilities } }),
  };
}
