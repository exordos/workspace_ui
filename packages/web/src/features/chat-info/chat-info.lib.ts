import type { UserRecord } from "~/entities/user/user.model";
import { areCustomProfileDataEqual } from "~/shared/lib/user-profile-fields.lib";
import type {
  ChatInfoContext,
  ChatInfoData,
  ChatInfoMember,
  ChatInfoTopic,
} from "./chat-info.types";

// Вспомогательная логика chat-info:
// проверка контекста, построение payload и сравнение данных.
export function hasChatInfoContext(context: ChatInfoContext): boolean {
  return context.kind !== "none";
}

// Стабильный ключ контекста для дедупа и контроля перезапросов.
export function getChatInfoNetworkKey(context: ChatInfoContext): string {
  if (context.kind === "none") {
    return `none:${context.instanceId ?? ""}`;
  }
  if (context.kind === "stream") {
    return `stream:${context.instanceId}:${context.streamId}`;
  }
  const participantKey = [...context.participantIds].sort((a, b) => a - b).join(",");
  return `dm:${context.instanceId}:${participantKey}`;
}

// Нормализация пользователя в формат участника chat-info.
function mapMember(user: UserRecord): ChatInfoMember {
  return {
    userId: user.user_id,
    fullName: user.full_name?.trim() || "",
    email: user.email ?? "",
    avatarUrl: user.avatar_url ?? null,
    isOnline: user.presence?.status === "active",
    profileData: user.profile_data,
  };
}

/** Stream channel member list: no custom profile fields (shown only in DM info / full profile). */
function mapStreamMember(user: UserRecord): ChatInfoMember {
  return {
    userId: user.user_id,
    fullName: user.full_name?.trim() || "",
    email: user.email ?? "",
    avatarUrl: user.avatar_url ?? null,
    isOnline: user.presence?.status === "active",
  };
}

export function buildDmChatInfoData(
  dmName: string,
  participants: UserRecord[],
  memberCount = participants.length,
): ChatInfoData {
  // Удаляем дубли участников и считаем online только по реально загруженным пользователям.
  const uniqueParticipants = new Map<number, UserRecord>();
  for (const participant of participants) {
    uniqueParticipants.set(participant.user_id, participant);
  }
  const members = Array.from(uniqueParticipants.values()).map(mapMember);
  return {
    type: "dm",
    name: dmName,
    memberCount: Math.max(memberCount, members.length),
    onlineCount: members.filter((member) => member.isOnline).length,
    members,
    description: null,
    isMuted: false,
  };
}

export function buildStreamChatInfoData(
  streamName: string,
  memberIds: number[],
  users: UserRecord[],
  isMuted: boolean,
  metadata?: {
    description?: string | null;
    topics?: ChatInfoTopic[];
  },
): ChatInfoData {
  // Для stream учитываем server memberIds как источник total memberCount.
  const members = users.map(mapStreamMember);
  const description = metadata?.description?.trim() ? metadata.description.trim() : null;
  const topics =
    metadata?.topics?.map((topic) => ({
      name: topic.name,
      unreadCount: topic.unreadCount > 0 ? topic.unreadCount : 0,
    })) ?? [];
  return {
    type: "stream",
    name: streamName,
    memberCount: memberIds.length,
    onlineCount: members.filter((member) => member.isOnline).length,
    members,
    description,
    topics,
    isMuted,
  };
}

// Сравнение участников нужно, чтобы не делать лишний setState с теми же данными.
function areMembersEqual(a: ChatInfoMember[], b: ChatInfoMember[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const left = a[i]!;
    const right = b[i]!;
    if (
      left.userId !== right.userId ||
      left.fullName !== right.fullName ||
      left.email !== right.email ||
      left.avatarUrl !== right.avatarUrl ||
      left.isOnline !== right.isOnline ||
      !areCustomProfileDataEqual(left.profileData, right.profileData)
    ) {
      return false;
    }
  }
  return true;
}

// Сравнение топиков нужно для тихих локальных пересчетов без лишних перерисовок.
function areTopicsEqual(a: ChatInfoTopic[] | undefined, b: ChatInfoTopic[] | undefined): boolean {
  const left = a ?? [];
  const right = b ?? [];
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) {
    const l = left[i]!;
    const r = right[i]!;
    if (l.name !== r.name || l.unreadCount !== r.unreadCount) {
      return false;
    }
  }
  return true;
}

// Полное сравнение payload для защиты от избыточных обновлений стора.
export function isSameChatInfoData(a: ChatInfoData | null, b: ChatInfoData): boolean {
  if (!a) return false;
  return (
    a.type === b.type &&
    a.name === b.name &&
    a.memberCount === b.memberCount &&
    a.onlineCount === b.onlineCount &&
    a.description === b.description &&
    a.isMuted === b.isMuted &&
    areMembersEqual(a.members, b.members) &&
    areTopicsEqual(a.topics, b.topics)
  );
}
