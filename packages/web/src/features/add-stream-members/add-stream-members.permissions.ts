// Доменная проверка прав на добавление участников в канал.
// Логика объединяет org-level guard и channel-level group-setting права Zulip.
import type { ZulipGroupSettingValue } from "~/shared/api/zulip.types";
import { UserRole } from "~/shared/lib/roles";

interface AddStreamMembersPermissionInput {
  currentUserId: number | null;
  orgRole: UserRole;
  canAddSubscribersGroup?: ZulipGroupSettingValue;
  canAdministerChannelGroup?: ZulipGroupSettingValue;
  isUserInGroupSetting: (setting: ZulipGroupSettingValue | undefined, userId: number) => boolean;
}

// Возвращает итоговое право на добавление участников в текущий stream.
// Правило:
// 1) Пользователь должен быть известен и не быть Guest в организации.
// 2) Owner/Admin допускаются как realm-level fallback.
// 3) Для остальных проверяем membership в channel admin/add-subscribers group-setting.
export function canAddMembersToStream(input: AddStreamMembersPermissionInput): boolean {
  const { currentUserId, orgRole, canAddSubscribersGroup, canAdministerChannelGroup } = input;
  if (currentUserId == null) {
    return false;
  }
  if (orgRole === UserRole.Guest) {
    return false;
  }
  if (orgRole === UserRole.Owner || orgRole === UserRole.Admin) {
    return true;
  }
  if (input.isUserInGroupSetting(canAdministerChannelGroup, currentUserId)) {
    return true;
  }
  if (input.isUserInGroupSetting(canAddSubscribersGroup, currentUserId)) {
    return true;
  }
  return false;
}
