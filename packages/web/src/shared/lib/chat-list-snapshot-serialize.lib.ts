/**
 * JSON-serializable representation of chat-list store maps for IndexedDB persistence.
 */
import type { MessageId } from "~/shared/lib/message-id.lib";
import type { UserId } from "~/shared/lib/user-id.lib";
import type { DmEntryInternal, StreamEntryInternal } from "~/shared/types/sidebar-chat";

/** Same shape as `MessageLocation` in chat-list entity (kept here to avoid shared→entities import). */
export type ChatListSnapshotMessageLocation =
  | { type: "stream"; streamUuid: string; topic: string; topicUuid?: string }
  | { type: "dm"; dmKey: string };

export interface ChatListSnapshotSerialized {
  version: 1;
  currentUserId: UserId | null;
  /** Max messenger message id seen in the last full/delta bootstrap (for incremental fetch). */
  lastMessageId: MessageId | null;
  /** Min message id from last bootstrap window (optional, for debugging). */
  oldestMessageId: MessageId | null;
  streamsEntries: [string, StreamEntryInternalSerialized][];
  dmsEntries: [string, DmEntryInternal][];
  messageIdToLocationEntries: [MessageId, ChatListSnapshotMessageLocation][];
  updatedAt: number;
}

type TopicRow = StreamEntryInternal["topics"] extends Map<string, infer V> ? V : never;

export type StreamEntryInternalSerialized = Omit<StreamEntryInternal, "topics"> & {
  topics: [string, TopicRow][];
};

export function serializeStreamEntry(s: StreamEntryInternal): StreamEntryInternalSerialized {
  return {
    ...s,
    topics: Array.from(s.topics.entries()),
  };
}

export function deserializeStreamEntry(s: StreamEntryInternalSerialized): StreamEntryInternal {
  return {
    ...s,
    topics: new Map(s.topics),
  };
}
