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

function isSameMessageLocation(
  a: MessageLocation | undefined,
  b: MessageLocation | undefined,
): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (a.type !== b.type) return false;
  if (a.type === "stream" && b.type === "stream") {
    return a.stream_id === b.stream_id && a.topic === b.topic;
  }
  if (a.type === "dm" && b.type === "dm") {
    return a.dmKey === b.dmKey;
  }
  return false;
}

function appendIdToIndexKey(index: Map<string, number[]>, key: string, messageId: number): void {
  const list = index.get(key);
  if (list) {
    list.push(messageId);
  } else {
    index.set(key, [messageId]);
  }
}

function removeIdFromIndexKey(index: Map<string, number[]>, key: string, messageId: number): void {
  const list = index.get(key);
  if (!list) return;
  const filtered = list.filter((id) => id !== messageId);
  if (filtered.length === 0) {
    index.delete(key);
  } else {
    index.set(key, filtered);
  }
}

/** O(1) add for a single new stream message location. */
function cloneStreamTopicIndex(
  index: ReadonlyMap<string, readonly number[]>,
): Map<string, number[]> {
  const next = new Map<string, number[]>();
  for (const [key, ids] of index) {
    next.set(key, [...ids]);
  }
  return next;
}

export function addMessageIdToStreamTopicIndex(
  index: ReadonlyMap<string, readonly number[]>,
  messageId: number,
  streamId: number,
  topicKey: string,
): Map<string, number[]> {
  const next = cloneStreamTopicIndex(index);
  appendIdToIndexKey(next, streamTopicCompositeKey(streamId, topicKey), messageId);
  return next;
}

/** O(list size) remove for one message id in a stream topic bucket. */
export function removeMessageIdFromStreamTopicIndex(
  index: ReadonlyMap<string, readonly number[]>,
  messageId: number,
  streamId: number,
  topicKey: string,
): Map<string, number[]> {
  const next = cloneStreamTopicIndex(index);
  removeIdFromIndexKey(next, streamTopicCompositeKey(streamId, topicKey), messageId);
  return next;
}

export function moveMessageIdBetweenStreamTopics(
  index: ReadonlyMap<string, readonly number[]>,
  messageId: number,
  streamId: number,
  oldTopicKey: string,
  newTopicKey: string,
): Map<string, number[]> {
  let next = removeMessageIdFromStreamTopicIndex(index, messageId, streamId, oldTopicKey);
  next = addMessageIdToStreamTopicIndex(next, messageId, streamId, newTopicKey);
  return next;
}

export function removeStreamTopicKeyFromIndex(
  index: ReadonlyMap<string, readonly number[]>,
  streamId: number,
  topicKey: string,
): Map<string, number[]> {
  const next = cloneStreamTopicIndex(index);
  next.delete(streamTopicCompositeKey(streamId, topicKey));
  return next;
}

export function removeStreamFromStreamTopicIndex(
  index: ReadonlyMap<string, readonly number[]>,
  streamId: number,
): Map<string, number[]> {
  const prefix = `${streamId}\t`;
  const next = cloneStreamTopicIndex(index);
  for (const key of next.keys()) {
    if (key.startsWith(prefix)) {
      next.delete(key);
    }
  }
  return next;
}

/**
 * Patches the inverted index from location-map changes only (O(changed message ids)).
 */
export function patchStreamTopicMessageIndex(
  prevIndex: ReadonlyMap<string, readonly number[]>,
  prevLoc: ReadonlyMap<number, MessageLocation>,
  nextLoc: ReadonlyMap<number, MessageLocation>,
): Map<string, number[]> {
  const nextIndex = cloneStreamTopicIndex(prevIndex);

  for (const [messageId, prevLocation] of prevLoc) {
    const nextLocation = nextLoc.get(messageId);
    if (isSameMessageLocation(prevLocation, nextLocation)) continue;
    if (prevLocation.type === "stream") {
      removeIdFromIndexKey(
        nextIndex,
        streamTopicCompositeKey(prevLocation.stream_id, prevLocation.topic),
        messageId,
      );
    }
    if (nextLocation?.type === "stream") {
      appendIdToIndexKey(
        nextIndex,
        streamTopicCompositeKey(nextLocation.stream_id, nextLocation.topic),
        messageId,
      );
    }
  }

  for (const [messageId, nextLocation] of nextLoc) {
    if (prevLoc.has(messageId)) continue;
    if (nextLocation.type === "stream") {
      appendIdToIndexKey(
        nextIndex,
        streamTopicCompositeKey(nextLocation.stream_id, nextLocation.topic),
        messageId,
      );
    }
  }

  return nextIndex;
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
