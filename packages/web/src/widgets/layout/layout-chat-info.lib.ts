import type { UserRecord } from "~/entities/user/user.model";
import type {
  ChatInfoData,
  ChatInfoMember,
  ChatInfoTopic,
} from "~/features/chat-info/chat-info.types";
import type { ChatInfoContextInput } from "./layout-chat-info.types";

export function hasChatInfoContext({ hasDmChat, streamId }: ChatInfoContextInput): boolean {
  if (hasDmChat) return true;
  return streamId != null;
}

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

export function buildDmChatInfoData(
  dmName: string,
  participants: UserRecord[],
  memberCount = participants.length,
): ChatInfoData {
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
  const members = users.map(mapMember);
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
