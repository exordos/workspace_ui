// Доменная проверка прав на добавление участников в канал.
// Логика объединяет org-level guard и channel-level group-setting права Zulip.
import type { ZulipGroupSettingValue } from "~/shared/api/zulip.types";
import type { UserRole } from "~/shared/lib/roles";
import {
  canManageMembersInStream,
  type CanManageMembersInStreamInput,
} from "~/shared/lib/stream-member-management-permissions.lib";

interface AddStreamMembersPermissionInput extends Omit<
  CanManageMembersInStreamInput,
  "operation" | "operationGroup"
> {
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
  return canManageMembersInStream({
    operation: "add",
    currentUserId: input.currentUserId,
    orgRole: input.orgRole,
    canAdministerChannelGroup: input.canAdministerChannelGroup,
    operationGroup: input.canAddSubscribersGroup,
    isUserInGroupSetting: input.isUserInGroupSetting,
  });
}
