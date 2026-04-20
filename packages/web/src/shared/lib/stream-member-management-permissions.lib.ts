// Единая доменная проверка прав на управление участниками канала.
// Нужна для консистентного поведения add/remove и устранения расхождений в логике.
import type { ZulipGroupSettingValue } from "~/shared/api/zulip.types";
import { assertNever } from "~/shared/lib/guards";
import { UserRole } from "~/shared/lib/roles";

// Тип операции управления участниками канала.
// Используется для явного контракта, какие сценарии поддерживает helper.
export type StreamMemberManagementOperation = "add" | "remove";

// Входной контракт общей проверки прав на add/remove участников канала.
export interface CanManageMembersInStreamInput {
  operation: StreamMemberManagementOperation;
  currentUserId: number | null;
  orgRole: UserRole;
  canAdministerChannelGroup?: ZulipGroupSettingValue;
  operationGroup?: ZulipGroupSettingValue;
  isUserInGroupSetting: (setting: ZulipGroupSettingValue | undefined, userId: number) => boolean;
}

// Возвращает operation-specific group-setting для выбранной операции.
// Сейчас для add/remove это единая ветка, но switch оставлен как расширяемая точка.
function resolveOperationGroup(
  input: CanManageMembersInStreamInput,
): ZulipGroupSettingValue | undefined {
  switch (input.operation) {
    case "add":
      return input.operationGroup;
    case "remove":
      return input.operationGroup;
    default:
      return assertNever(input.operation);
  }
}

// Единая проверка права на управление участниками stream.
// Правило:
// 1) deny, если пользователь не определен или Guest;
// 2) allow для org Owner/Admin;
// 3) allow для участников can_administer_channel_group;
// 4) allow для участников operation-specific group-setting;
// 5) иначе deny.
export function canManageMembersInStream(input: CanManageMembersInStreamInput): boolean {
  const { currentUserId, orgRole, canAdministerChannelGroup } = input;
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
  const operationGroup = resolveOperationGroup(input);
  if (input.isUserInGroupSetting(operationGroup, currentUserId)) {
    return true;
  }
  return false;
}
