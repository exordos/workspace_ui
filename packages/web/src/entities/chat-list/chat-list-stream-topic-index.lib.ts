/**
 * Inverted index: stream topic composite key → message ids in that topic.
 *
 * Rebuilt when messageIdToLocation changes; avoids O(L) scans on topic move/remove.
 */
import type { MessageLocation } from "./chat-list.model.types";

export function streamTopicCompositeKey(streamId: number, topicKey: string): string {
  return `${streamId}\t${topicKey}`;
}

export function buildStreamTopicMessageIndex(
  messageIdToLocation: ReadonlyMap<number, MessageLocation>,
): Map<string, number[]> {
  const index = new Map<string, number[]>();
  for (const [messageId, location] of messageIdToLocation) {
    if (location.type !== "stream") continue;
    const key = streamTopicCompositeKey(location.stream_id, location.topic);
    const list = index.get(key);
    if (list) {
      list.push(messageId);
    } else {
      index.set(key, [messageId]);
    }
  }
  return index;
}

export function getStreamTopicMessageIds(
  index: ReadonlyMap<string, readonly number[]>,
  streamId: number,
  topicKey: string,
): readonly number[] {
  return index.get(streamTopicCompositeKey(streamId, topicKey)) ?? [];
}

/** All message ids located in any topic of the given stream. */
export function collectMessageIdsForStream(
  index: ReadonlyMap<string, readonly number[]>,
  streamId: number,
): number[] {
  const prefix = `${streamId}\t`;
  const ids: number[] = [];
  for (const [key, list] of index) {
    if (key.startsWith(prefix)) {
      for (const messageId of list) {
        ids.push(messageId);
      }
    }
  }
  return ids;
}
