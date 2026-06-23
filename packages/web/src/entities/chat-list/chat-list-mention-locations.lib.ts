/**
 * Maps unread @mention message ids to sidebar stream/topic/DM rows via messageIdToLocation.
 */
import type { MockMessage, WorkspaceRawMessage } from "~/shared/api/messenger.types";
import { dmConversationKey } from "~/shared/lib/dm-key";
import type { MessageId } from "~/shared/lib/message-id.lib";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import type { UserId } from "~/shared/lib/user-id.lib";
import type { MessageLocation } from "./chat-list.model.types";

export type MentionFlagMessage = Pick<WorkspaceRawMessage, "id" | "sender_id" | "flags">;

export interface MentionLocationFlags {
  streamIds: ReadonlySet<string>;
  topicKeys: ReadonlySet<string>;
  dmKeys: ReadonlySet<string>;
}

const EMPTY_MENTION_FLAGS: MentionLocationFlags = {
  streamIds: new Set<string>(),
  topicKeys: new Set<string>(),
  dmKeys: new Set<string>(),
};

export function buildTopicMentionKey(streamId: string, topic: string): string {
  return `${streamId}:${normalizeTopicForIdentity(topic)}`;
}

function streamTopicLocationFromMessage(message: {
  stream_uuid?: string | null;
  subject?: string;
  topic_uuid?: string;
}): MessageLocation | null {
  if (message.stream_uuid == null) return null;
  const subject = normalizeTopicForIdentity(message.subject ?? "");
  const topicUuid =
    typeof message.topic_uuid === "string" && message.topic_uuid.trim().length > 0
      ? message.topic_uuid.trim().toLowerCase()
      : undefined;
  const topic = topicUuid ?? subject;
  if (topic.length === 0) return null;
  return {
    type: "stream",
    streamUuid: message.stream_uuid,
    topic,
    ...(topicUuid != null ? { topicUuid } : {}),
  };
}

export function buildMentionLocationFlags(
  mentionedUnreadMessageIds: ReadonlySet<MessageId>,
  messageIdToLocation: ReadonlyMap<MessageId, MessageLocation>,
): MentionLocationFlags {
  if (mentionedUnreadMessageIds.size === 0) {
    return EMPTY_MENTION_FLAGS;
  }

  const streamIds = new Set<string>();
  const topicKeys = new Set<string>();
  const dmKeys = new Set<string>();

  for (const messageId of mentionedUnreadMessageIds) {
    const location = messageIdToLocation.get(messageId);
    if (location == null) continue;
    if (location.type === "stream") {
      streamIds.add(location.streamUuid);
      topicKeys.add(buildTopicMentionKey(location.streamUuid, location.topic));
      continue;
    }
    if (location.dmKey.length > 0) {
      dmKeys.add(location.dmKey);
    }
  }

  return { streamIds, topicKeys, dmKeys };
}

export function messageLocationFromMockMessage(
  message: Pick<MockMessage, "stream_uuid" | "subject" | "topic_uuid" | "display_recipient">,
  currentUserId: UserId | null,
): MessageLocation | null {
  if (message.stream_uuid != null) {
    return streamTopicLocationFromMessage(message);
  }
  if (Array.isArray(message.display_recipient)) {
    const dmKey = dmConversationKey(message.display_recipient, currentUserId);
    if (dmKey.length === 0) return null;
    return { type: "dm", dmKey };
  }
  return null;
}

export function messageLocationFromRawMessage(
  message: Pick<
    WorkspaceRawMessage,
    "id" | "type" | "stream_uuid" | "subject" | "topic_uuid" | "display_recipient"
  >,
  currentUserId: UserId | null,
): MessageLocation | null {
  if (message.type === "stream" && message.stream_uuid != null) {
    return streamTopicLocationFromMessage(message);
  }
  if (message.type === "private" && Array.isArray(message.display_recipient)) {
    const dmKey = dmConversationKey(message.display_recipient, currentUserId);
    if (dmKey.length === 0) return null;
    return { type: "dm", dmKey };
  }
  if (message.stream_uuid != null) {
    return streamTopicLocationFromMessage(message);
  }
  return null;
}
