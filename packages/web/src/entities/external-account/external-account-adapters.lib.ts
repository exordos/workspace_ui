import type { WorkspaceExternalAccountDto } from "~/shared/api/messenger-external-accounts.types";
import type { ExternalAccount, ExternalAccountType } from "./external-account.types";

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
