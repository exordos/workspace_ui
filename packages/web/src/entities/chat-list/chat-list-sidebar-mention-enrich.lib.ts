import type { MessageId } from "~/shared/lib/message-id.lib";
import type { SidebarChat } from "~/shared/types/sidebar-chat";
import {
  buildMentionLocationFlags,
  buildTopicMentionKey,
  type MentionLocationFlags,
} from "./chat-list-mention-locations.lib";

export { buildMentionLocationFlags, type MentionLocationFlags };

export function enrichSidebarChatsWithMentionFlags(
  chats: readonly SidebarChat[],
  mentionedUnreadMessageIds: ReadonlySet<MessageId>,
  messageIdToLocation: ReadonlyMap<MessageId, import("./chat-list.model.types").MessageLocation>,
): SidebarChat[] {
  const mentionFlags = buildMentionLocationFlags(mentionedUnreadMessageIds, messageIdToLocation);
  if (mentionFlags.streamIds.size === 0 && mentionFlags.topicKeys.size === 0) {
    return [...chats];
  }

  return chats.map((chat) => {
    if (chat.type === "stream") {
      const topics = chat.topics?.map((topic) => ({
        ...topic,
        hasMention: mentionFlags.topicKeys.has(buildTopicMentionKey(chat.streamUuid, topic.subject))
          ? true
          : undefined,
      }));
      return {
        ...chat,
        topics,
        hasMention: mentionFlags.streamIds.has(chat.streamUuid) ? true : undefined,
      };
    }
    // Workspace DMs are 1:1 only; the unread badge already covers direct messages.
    return chat;
  });
}
