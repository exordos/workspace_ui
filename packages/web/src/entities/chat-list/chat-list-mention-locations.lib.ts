/**
 * Maps unread @mention message ids to sidebar stream/topic/DM rows via messageIdToLocation.
 */
import type { MockMessage, ZulipRawMessage } from "~/shared/api/zulip.types";
import { dmConversationKey } from "~/shared/lib/dm-key";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import type { MessageLocation } from "./chat-list.model.types";

export type MentionFlagMessage = Pick<ZulipRawMessage, "id" | "sender_id" | "flags">;

export interface MentionLocationFlags {
  streamIds: ReadonlySet<number>;
  topicKeys: ReadonlySet<string>;
  dmKeys: ReadonlySet<string>;
}

const EMPTY_MENTION_FLAGS: MentionLocationFlags = {
  streamIds: new Set<number>(),
  topicKeys: new Set<string>(),
  dmKeys: new Set<string>(),
};

export function buildTopicMentionKey(streamId: number, topic: string): string {
  return `${streamId}:${normalizeTopicForIdentity(topic)}`;
}

export function buildMentionLocationFlags(
  mentionedUnreadMessageIds: ReadonlySet<number>,
  messageIdToLocation: ReadonlyMap<number, MessageLocation>,
): MentionLocationFlags {
  if (mentionedUnreadMessageIds.size === 0) {
    return EMPTY_MENTION_FLAGS;
  }

  const streamIds = new Set<number>();
  const topicKeys = new Set<string>();
  const dmKeys = new Set<string>();

  for (const messageId of mentionedUnreadMessageIds) {
    const location = messageIdToLocation.get(messageId);
    if (location == null) continue;
    if (location.type === "stream") {
      streamIds.add(location.stream_id);
      topicKeys.add(buildTopicMentionKey(location.stream_id, location.topic));
      continue;
    }
    if (location.dmKey.length > 0) {
      dmKeys.add(location.dmKey);
    }
  }

  return { streamIds, topicKeys, dmKeys };
}

export function messageLocationFromMockMessage(
  message: Pick<MockMessage, "stream_id" | "subject" | "display_recipient">,
  currentUserId: number | null,
): MessageLocation | null {
  if (message.stream_id != null) {
    return {
      type: "stream",
      stream_id: message.stream_id,
      topic: normalizeTopicForIdentity(message.subject ?? ""),
    };
  }
  if (Array.isArray(message.display_recipient)) {
    const dmKey = dmConversationKey(message.display_recipient, currentUserId);
    if (dmKey.length === 0) return null;
    return { type: "dm", dmKey };
  }
  return null;
}

export function messageLocationFromRawMessage(
  message: Pick<ZulipRawMessage, "id" | "type" | "stream_id" | "subject" | "display_recipient">,
  currentUserId: number | null,
): MessageLocation | null {
  if (message.type === "stream" && message.stream_id != null) {
    return {
      type: "stream",
      stream_id: message.stream_id,
      topic: normalizeTopicForIdentity(message.subject ?? ""),
    };
  }
  if (message.type === "private" && Array.isArray(message.display_recipient)) {
    const dmKey = dmConversationKey(message.display_recipient, currentUserId);
    if (dmKey.length === 0) return null;
    return { type: "dm", dmKey };
  }
  if (message.stream_id != null) {
    return {
      type: "stream",
      stream_id: message.stream_id,
      topic: normalizeTopicForIdentity(message.subject ?? ""),
    };
  }
  return null;
}
