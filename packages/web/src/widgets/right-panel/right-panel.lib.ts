import { formatUserStatusLabel } from "~/entities/user/user-status.lib";
import type { UserRecord } from "~/entities/user/user.model";
import type { ChatInfoMember } from "~/features/chat-info/chat-info.types";
import { getRealmBaseUrl } from "~/shared/api/zulip-client.internal";
import type { ZulipGroupSettingValue } from "~/shared/api/zulip.types";
import { resolveAvatarUrl } from "~/shared/lib/avatar";
import { parseRole, UserRole } from "~/shared/lib/roles";
import { isValidEmail } from "~/shared/lib/validation";
import type { RightPanelUserInfo } from "./right-panel.types";

// View-model участника канала для правой панели.
// Хранит все вычисленные UI-флаги и текстовые поля, чтобы компонент рендерил готовую структуру.
export interface RightPanelStreamMemberViewModel {
  userId: number;
  name: string;
  status: string;
  isOrgOwner: boolean;
  isCreator: boolean;
  isChannelAdmin: boolean;
  isOnline: boolean;
  avatarUrl: string | null;
}

// Входные параметры для сборки view-model участников канала.
// Объединяет сырые members из chat-info, users directory и channel-level permission metadata.
interface BuildRightPanelStreamMembersInput {
  members: readonly ChatInfoMember[];
  users: Map<number, UserRecord>;
  streamCreatorId: number | undefined;
  canAdministerChannelGroup: ZulipGroupSettingValue | undefined;
  isUserInGroupSetting: (setting: ZulipGroupSettingValue | undefined, userId: number) => boolean;
  memberFallbackLabel: string;
  onlineLabel: string;
  offlineLabel: string;
}

// Собирает список участников канала в формат, удобный для рендера правой панели.
// Внутри вычисляет бейджи Creator/Channel admin и статус отображения на основе users store.
export function buildRightPanelStreamMembers(
  input: BuildRightPanelStreamMembersInput,
): RightPanelStreamMemberViewModel[] {
  return input.members.map((member) => {
    const userRecord = input.users.get(member.userId);
    const memberRole = parseRole(userRecord?.role);
    return {
      userId: member.userId,
      name: member.fullName || input.memberFallbackLabel,
      status:
        formatUserStatusLabel(userRecord?.status) ??
        (member.isOnline ? input.onlineLabel : input.offlineLabel),
      isOrgOwner: memberRole === UserRole.Owner,
      isCreator: input.streamCreatorId != null && member.userId === input.streamCreatorId,
      isChannelAdmin:
        memberRole === UserRole.Owner ||
        memberRole === UserRole.Admin ||
        input.isUserInGroupSetting(input.canAdministerChannelGroup, member.userId),
      isOnline: member.isOnline,
      avatarUrl: member.avatarUrl,
    };
  });
}

export function resolveAvatarSrc(url: string | undefined | null): string | undefined {
  return resolveAvatarUrl(url, getRealmBaseUrl());
}

export { buildStreamSlug } from "~/shared/lib/stream-slug.lib";

export function buildMailtoHref(email: string | undefined): string | undefined {
  if (!email) return undefined;
  const trimmed = email.trim();
  if (!isValidEmail(trimmed)) return undefined;
  return `mailto:${trimmed}`;
}

export function buildTelHref(phone: string | undefined): string | undefined {
  if (!phone) return undefined;
  const normalized = phone.replace(/[^\d+]/g, "");
  if (!/^\+?\d{5,}$/.test(normalized)) return undefined;
  return `tel:${normalized}`;
}

export function formatDateJoined(dateJoined: string | undefined): string | undefined {
  if (!dateJoined) return undefined;
  const trimmed = dateJoined.trim();
  if (trimmed.length === 0) return undefined;
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return trimmed;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(parsed);
}

export function resolveMentionNickname({
  username,
  email,
}: Pick<RightPanelUserInfo, "username" | "email">): string | undefined {
  const candidates = [username, email];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const trimmed = candidate.trim();
    if (trimmed.length === 0) continue;
    const atIndex = trimmed.indexOf("@");
    const rawNick = atIndex > 0 ? trimmed.slice(0, atIndex) : trimmed;
    const normalizedNick = rawNick.trim();
    if (normalizedNick.length > 0) return normalizedNick;
  }

  return undefined;
}
