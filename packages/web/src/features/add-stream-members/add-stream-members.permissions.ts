// Доменная проверка прав на добавление участников в канал.
// Логика объединяет org-level guard и channel-level group-setting права Zulip.
import type { CurrentUserChannelCapabilities } from "~/entities/user/user.model";
import type { ZulipGroupSettingValue } from "~/shared/api/zulip.types";
import type { UserRole } from "~/shared/lib/roles";
import {
  resolveCurrentUserChannelCapabilities,
  type ResolveCurrentUserChannelCapabilitiesInput,
} from "~/shared/lib/stream-member-management-permissions.lib";

interface AddStreamMembersPermissionInput extends ResolveCurrentUserChannelCapabilitiesInput {
  currentUserId: number | null;
  orgRole: UserRole;
  currentUserChannelCapabilities?: CurrentUserChannelCapabilities;
  inviteOnly?: boolean;
  canAddSubscribersGroup?: ZulipGroupSettingValue;
  canAdministerChannelGroup?: ZulipGroupSettingValue;
  isUserInGroupSetting: (setting: ZulipGroupSettingValue | undefined, userId: number) => boolean;
}

// Возвращает итоговое право на добавление участников в текущий stream.
// Правило:
// 1) Пользователь должен быть известен и не быть Guest в организации.
// 2) channel-level add-subscribers group и org-level realm group имеют приоритет.
// 3) Channel admin может добавлять участников только в public channels.
export function canAddMembersToStream(input: AddStreamMembersPermissionInput): boolean {
  return resolveCurrentUserChannelCapabilities(input).canAddSubscribers;
}
