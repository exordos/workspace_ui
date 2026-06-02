import { dmRouteKey } from "~/shared/lib/dm-key";
import { effectiveDmIsGroupFromSlug } from "~/shared/lib/dm-route.lib";
import type { SidebarChat, DmEntryInternal } from "~/shared/types/sidebar-chat";
import {
  buildMentionLocationFlags,
  buildTopicMentionKey,
  type MentionLocationFlags,
} from "./chat-list-mention-locations.lib";

export { buildMentionLocationFlags, type MentionLocationFlags };

function parseSlugUserIds(slug: string): number[] {
  return slug
    .split(",")
    .map((part) => part.split("-")[0]?.trim() ?? "")
    .map((raw) => Number(raw))
    .filter((id) => Number.isSafeInteger(id) && id > 0);
}

function resolveDmSlugUserIds(entry: Pick<DmEntryInternal, "slug" | "userIds">): number[] {
  return entry.userIds != null && entry.userIds.length > 0
    ? entry.userIds
    : parseSlugUserIds(entry.slug);
}

export function shouldShowMentionBadgeOnDmRow(
  entry: Pick<DmEntryInternal, "isGroup" | "slug" | "userIds">,
  dmKey: string,
  currentUserId: number | null,
  mentionFlags: MentionLocationFlags,
): boolean {
  if (!mentionFlags.dmKeys.has(dmKey)) return false;
  return effectiveDmIsGroupFromSlug(entry.isGroup, resolveDmSlugUserIds(entry), currentUserId);
}

export function enrichSidebarChatsWithMentionFlags(
  chats: readonly SidebarChat[],
  mentionedUnreadMessageIds: ReadonlySet<number>,
  messageIdToLocation: ReadonlyMap<number, import("./chat-list.model.types").MessageLocation>,
  currentUserId: number | null,
): SidebarChat[] {
  const mentionFlags = buildMentionLocationFlags(mentionedUnreadMessageIds, messageIdToLocation);
  if (
    mentionFlags.streamIds.size === 0 &&
    mentionFlags.topicKeys.size === 0 &&
    mentionFlags.dmKeys.size === 0
  ) {
    return [...chats];
  }

  return chats.map((chat) => {
    if (chat.type === "stream") {
      const topics = chat.topics?.map((topic) => ({
        ...topic,
        hasMention: mentionFlags.topicKeys.has(buildTopicMentionKey(chat.stream_id, topic.subject))
          ? true
          : undefined,
      }));
      return {
        ...chat,
        topics,
        hasMention: mentionFlags.streamIds.has(chat.stream_id) ? true : undefined,
      };
    }

    const slugUserIds =
      chat.userIds != null && chat.userIds.length > 0 ? chat.userIds : parseSlugUserIds(chat.slug);
    if (!effectiveDmIsGroupFromSlug(chat.isGroup, slugUserIds, currentUserId)) {
      return chat;
    }
    const dmKey = dmRouteKey(slugUserIds, currentUserId);
    if (!mentionFlags.dmKeys.has(dmKey)) {
      return chat;
    }
    return { ...chat, hasMention: true };
  });
}
