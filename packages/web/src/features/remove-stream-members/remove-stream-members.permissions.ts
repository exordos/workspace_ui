// Доменная проверка прав на удаление участников из канала.
// Логика объединяет org-level guard и channel-level group-setting права Zulip.
import type { ZulipGroupSettingValue } from "~/shared/api/zulip.types";
import type { UserRole } from "~/shared/lib/roles";
import {
  canManageMembersInStream,
  type CanManageMembersInStreamInput,
} from "~/shared/lib/stream-member-management-permissions.lib";

interface RemoveStreamMembersPermissionInput extends Omit<
  CanManageMembersInStreamInput,
  "operation" | "operationGroup"
> {
  currentUserId: number | null;
  orgRole: UserRole;
  canAdministerChannelGroup?: ZulipGroupSettingValue;
  canRemoveSubscribersGroup?: ZulipGroupSettingValue;
  isUserInGroupSetting: (setting: ZulipGroupSettingValue | undefined, userId: number) => boolean;
}

// Возвращает итоговое право на удаление участников из текущего stream.
// Правило:
// 1) Пользователь должен быть известен и не быть Guest в организации.
// 2) Owner/Admin допускаются как realm-level fallback.
// 3) Для остальных проверяем membership в channel admin/remove-subscribers group-setting.
export function canRemoveMembersFromStream(input: RemoveStreamMembersPermissionInput): boolean {
  return canManageMembersInStream({
    operation: "remove",
    currentUserId: input.currentUserId,
    orgRole: input.orgRole,
    canAdministerChannelGroup: input.canAdministerChannelGroup,
    operationGroup: input.canRemoveSubscribersGroup,
    isUserInGroupSetting: input.isUserInGroupSetting,
  });
}
