// Доменная проверка прав на удаление участников из канала.
// Логика объединяет org-level guard и channel-level group-setting права Zulip.
import type { CurrentUserChannelCapabilities } from "~/entities/user/user.model";
import type { ZulipGroupSettingValue } from "~/shared/api/zulip.types";
import type { UserRole } from "~/shared/lib/roles";
import {
  resolveCurrentUserChannelCapabilities,
  type ResolveCurrentUserChannelCapabilitiesInput,
} from "~/shared/lib/stream-member-management-permissions.lib";

interface RemoveStreamMembersPermissionInput extends ResolveCurrentUserChannelCapabilitiesInput {
  currentUserId: number | null;
  orgRole: UserRole;
  currentUserChannelCapabilities?: CurrentUserChannelCapabilities;
  canAdministerChannelGroup?: ZulipGroupSettingValue;
  canRemoveSubscribersGroup?: ZulipGroupSettingValue;
  isUserInGroupSetting: (setting: ZulipGroupSettingValue | undefined, userId: number) => boolean;
}

// Возвращает итоговое право на удаление участников из текущего stream.
// Правило:
// 1) Пользователь должен быть известен и не быть Guest в организации.
// 2) Owner/Admin всегда могут удалять участников.
// 3) Channel admin и remove-subscribers group тоже дают доступ.
export function canRemoveMembersFromStream(input: RemoveStreamMembersPermissionInput): boolean {
  return resolveCurrentUserChannelCapabilities(input).canRemoveSubscribers;
}
