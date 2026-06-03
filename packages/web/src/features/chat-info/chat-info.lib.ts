import type { UserRecord } from "~/entities/user/user.model";
import { areCustomProfileDataEqual } from "~/shared/lib/user-profile-fields.lib";
import type {
  ChatInfoContext,
  ChatInfoData,
  ChatInfoMember,
  ChatInfoTopic,
} from "./chat-info.types";

// chat-info helpers: context keys, payload build, equality checks.
export function hasChatInfoContext(context: ChatInfoContext): boolean {
  return context.kind !== "none";
}

// Stable context key for dedupe and re-fetch control.
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
  // Dedupe members; online count only from loaded user records.
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
  // Stream memberCount follows server memberIds, not loaded user subset.
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

// Skip setState when member lists are unchanged.
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

// Topic equality for silent local derived updates.
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

// Full payload equality to avoid redundant store writes.
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
