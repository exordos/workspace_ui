import { formatUserStatusLabel } from "~/entities/user/user-status.lib";
import type { UserRecord } from "~/entities/user/user.model";
import type { ChatInfoMember } from "~/features/chat-info/chat-info.types";
import { getRealmBaseUrl } from "~/shared/api/zulip-client.internal";
import type { ZulipGroupSettingValue } from "~/shared/api/zulip.types";
import { resolveAvatarUrl } from "~/shared/lib/avatar";
import { parseRole, UserRole } from "~/shared/lib/roles";
import { isValidEmail } from "~/shared/lib/validation";
import type { RightPanelUserInfo } from "./right-panel.types";

// Channel member view-model for right panel — precomputed flags for thin UI render.
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

// Inputs: chat-info members, users directory, channel permission metadata.
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

// Build right-panel member rows with Creator/Channel admin badges from users store.
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

export { formatDateJoined } from "~/shared/lib/datetime.lib";

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
