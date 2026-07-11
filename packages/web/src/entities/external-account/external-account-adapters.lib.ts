import type { WorkspaceExternalAccountDto } from "~/shared/api/messenger-external-accounts.types";
import type { WorkspaceExternalAccountCacheProfile } from "~/shared/lib/workspace-external-account-cache-db";
import type { ExternalAccount, ExternalAccountType } from "./external-account.types";

function trimOptional(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed != null && trimmed.length > 0 ? trimmed : null;
}

export function adaptWorkspaceExternalAccountDto(
  dto: WorkspaceExternalAccountDto,
): ExternalAccount {
  return {
    uuid: dto.uuid,
    projectId: dto.project_id,
    userUuid: dto.user_uuid,
    serverUrl: dto.server_url,
    sourceScope: dto.source_scope ?? null,
    accountType: dto.account_type,
    status: dto.status,
    accessStatus: dto.access_status,
    accessCheckedAt: dto.access_checked_at ?? null,
    accessConfirmedAt: dto.access_confirmed_at ?? null,
    accessNextCheckAt: dto.access_next_check_at ?? dto.updated_at,
    accessLastError: dto.access_last_error ?? null,
    accountSettingsKind: dto.account_settings.kind,
    userInfo:
      dto.account_settings.user_info == null
        ? null
        : {
            userId: dto.account_settings.user_info.user_id ?? null,
            email: trimOptional(dto.account_settings.user_info.email),
            fullName: trimOptional(dto.account_settings.user_info.full_name),
            avatarUrl: dto.account_settings.user_info.avatar_url ?? null,
          },
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
