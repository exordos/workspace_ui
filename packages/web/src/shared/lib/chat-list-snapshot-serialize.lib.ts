/**
 * JSON-serializable representation of chat-list store maps for IndexedDB persistence.
 */
import type { DmEntryInternal, StreamEntryInternal } from "~/shared/types/sidebar-chat";

/** Same shape as `MessageLocation` in chat-list entity (kept here to avoid shared→entities import). */
export type ChatListSnapshotMessageLocation =
  | { type: "stream"; stream_id: number; topic: string }
  | { type: "dm"; dmKey: string };

export interface ChatListSnapshotSerialized {
  version: 1;
  currentUserId: number | null;
  /** Max Zulip message id seen in the last full/delta bootstrap (for incremental fetch). */
  lastMessageId: number | null;
  /** Min message id from last bootstrap window (optional, for debugging). */
  oldestMessageId: number | null;
  streamsEntries: [number, StreamEntryInternalSerialized][];
  dmsEntries: [string, DmEntryInternal][];
  messageIdToLocationEntries: [number, ChatListSnapshotMessageLocation][];
  updatedAt: number;
}

type TopicRow = StreamEntryInternal["topics"] extends Map<string, infer V> ? V : never;

export type StreamEntryInternalSerialized = Omit<StreamEntryInternal, "topics"> & {
  topics: [string, TopicRow][];
};

export function serializeStreamEntry(s: StreamEntryInternal): StreamEntryInternalSerialized {
  return {
    ...s,
    topics: Array.from(s.topics.entries()) as [string, TopicRow][],
  };
}

export function deserializeStreamEntry(s: StreamEntryInternalSerialized): StreamEntryInternal {
  return {
    ...s,
    topics: new Map(s.topics),
  };
}
