// Доменная проверка прав на удаление участников из канала.
// Логика объединяет org-level guard и channel-level group-setting права Zulip.
import type { ZulipGroupSettingValue } from "~/shared/api/zulip.types";
import { UserRole } from "~/shared/lib/roles";

interface RemoveStreamMembersPermissionInput {
  currentUserId: number | null;
  orgRole: UserRole;
  canRemoveSubscribersGroup?: ZulipGroupSettingValue;
  isUserInGroupSetting: (setting: ZulipGroupSettingValue | undefined, userId: number) => boolean;
}

// Возвращает итоговое право на удаление участников из текущего stream.
// Правило:
// 1) Пользователь должен быть известен и не быть Guest в организации.
// 2) Owner/Admin допускаются как realm-level fallback.
// 3) Для остальных проверяем membership в can_remove_subscribers_group.
export function canRemoveMembersFromStream(input: RemoveStreamMembersPermissionInput): boolean {
  const { currentUserId, orgRole, canRemoveSubscribersGroup } = input;
  if (currentUserId == null) {
    return false;
  }
  if (orgRole === UserRole.Guest) {
    return false;
  }
  if (orgRole === UserRole.Owner || orgRole === UserRole.Admin) {
    return true;
  }
  if (input.isUserInGroupSetting(canRemoveSubscribersGroup, currentUserId)) {
    return true;
  }
  return false;
}
