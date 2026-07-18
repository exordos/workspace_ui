import type {
  ChatListStreamMetadataRow,
  ChatListStreamTopicMetadataRow,
} from "~/entities/chat-list/chat-list.model.types";
import type { MessengerMeStream, MessengerStreamTopic } from "~/shared/api/messenger.types";

export function toStreamMetadataRowsFromMeStreams(
  streams: readonly MessengerMeStream[],
): ChatListStreamMetadataRow[] {
  return streams
    .filter((stream) => stream.stream_uuid.trim().length > 0 && stream.name.trim().length > 0)
    .map((stream) => ({
      streamUuid: stream.stream_uuid,
      defaultTopicUuid: stream.default_topic_uuid,
      name: stream.name,
      unreadCount: stream.unread_count,
      private: stream.private,
      ...(stream.color != null ? { color: stream.color } : {}),
      ...(stream.source_name != null ? { sourceName: stream.source_name } : {}),
      ...(stream.source != null ? { source: stream.source } : {}),
      ...(stream.provider != null ? { provider: stream.provider } : {}),
      ...(stream.delivery != null ? { delivery: stream.delivery } : {}),
      inviteOnly: stream.invite_only,
    }));
}

export function toStreamTopicMetadataRows(
  topics: readonly MessengerStreamTopic[],
): ChatListStreamTopicMetadataRow[] {
  return topics
    .filter((topic) => topic.uuid.trim().length > 0 && topic.stream_uuid.trim().length > 0)
    .map((topic) => ({
      topicUuid: topic.uuid,
      streamUuid: topic.stream_uuid,
      name: topic.name,
      unreadCount: topic.unread_count,
      isDefault: topic.is_default,
      isDone: topic.is_done,
      ...(topic.color != null ? { color: topic.color } : {}),
      ...(topic.source_name != null ? { sourceName: topic.source_name } : {}),
      ...(topic.source != null ? { source: topic.source } : {}),
      ...(topic.provider != null ? { provider: topic.provider } : {}),
      ...(topic.delivery != null ? { delivery: topic.delivery } : {}),
    }));
}
