/**
 * Inverted index: stream topic composite key → message ids in that topic.
 *
 * Rebuilt when messageIdToLocation changes; avoids O(L) scans on topic move/remove.
 */
import type { MessageId } from "~/shared/lib/message-id.lib";
import type { MessageLocation } from "./chat-list.model.types";

export function streamTopicCompositeKey(streamId: string, topicKey: string): string {
  return `${streamId}\t${topicKey}`;
}

export function buildStreamTopicMessageIndex(
  messageIdToLocation: ReadonlyMap<MessageId, MessageLocation>,
): Map<string, MessageId[]> {
  const index = new Map<string, MessageId[]>();
  for (const [messageId, location] of messageIdToLocation) {
    if (location.type !== "stream") continue;
    const key = streamTopicCompositeKey(location.streamUuid, location.topic);
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
    return a.streamUuid === b.streamUuid && a.topic === b.topic;
  }
  if (a.type === "dm" && b.type === "dm") {
    return a.dmKey === b.dmKey;
  }
  return false;
}

function appendIdToIndexKey(
  index: Map<string, MessageId[]>,
  key: string,
  messageId: MessageId,
): void {
  const list = index.get(key);
  if (list) {
    list.push(messageId);
  } else {
    index.set(key, [messageId]);
  }
}

function removeIdFromIndexKey(
  index: Map<string, MessageId[]>,
  key: string,
  messageId: MessageId,
): void {
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
  index: ReadonlyMap<string, readonly MessageId[]>,
): Map<string, MessageId[]> {
  const next = new Map<string, MessageId[]>();
  for (const [key, ids] of index) {
    next.set(key, [...ids]);
  }
  return next;
}

export function addMessageIdToStreamTopicIndex(
  index: ReadonlyMap<string, readonly MessageId[]>,
  messageId: MessageId,
  streamId: string,
  topicKey: string,
): Map<string, MessageId[]> {
  const next = cloneStreamTopicIndex(index);
  appendIdToIndexKey(next, streamTopicCompositeKey(streamId, topicKey), messageId);
  return next;
}

/** O(list size) remove for one message id in a stream topic bucket. */
export function removeMessageIdFromStreamTopicIndex(
  index: ReadonlyMap<string, readonly MessageId[]>,
  messageId: MessageId,
  streamId: string,
  topicKey: string,
): Map<string, MessageId[]> {
  const next = cloneStreamTopicIndex(index);
  removeIdFromIndexKey(next, streamTopicCompositeKey(streamId, topicKey), messageId);
  return next;
}

export function removeStreamTopicKeyFromIndex(
  index: ReadonlyMap<string, readonly MessageId[]>,
  streamId: string,
  topicKey: string,
): Map<string, MessageId[]> {
  const next = cloneStreamTopicIndex(index);
  next.delete(streamTopicCompositeKey(streamId, topicKey));
  return next;
}

export function removeStreamFromStreamTopicIndex(
  index: ReadonlyMap<string, readonly MessageId[]>,
  streamId: string,
): Map<string, MessageId[]> {
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
  prevIndex: ReadonlyMap<string, readonly MessageId[]>,
  prevLoc: ReadonlyMap<MessageId, MessageLocation>,
  nextLoc: ReadonlyMap<MessageId, MessageLocation>,
): Map<string, MessageId[]> {
  const nextIndex = cloneStreamTopicIndex(prevIndex);

  for (const [messageId, prevLocation] of prevLoc) {
    const nextLocation = nextLoc.get(messageId);
    if (isSameMessageLocation(prevLocation, nextLocation)) continue;
    if (prevLocation.type === "stream") {
      removeIdFromIndexKey(
        nextIndex,
        streamTopicCompositeKey(prevLocation.streamUuid, prevLocation.topic),
        messageId,
      );
    }
    if (nextLocation?.type === "stream") {
      appendIdToIndexKey(
        nextIndex,
        streamTopicCompositeKey(nextLocation.streamUuid, nextLocation.topic),
        messageId,
      );
    }
  }

  for (const [messageId, nextLocation] of nextLoc) {
    if (prevLoc.has(messageId)) continue;
    if (nextLocation.type === "stream") {
      appendIdToIndexKey(
        nextIndex,
        streamTopicCompositeKey(nextLocation.streamUuid, nextLocation.topic),
        messageId,
      );
    }
  }

  return nextIndex;
}

export function getStreamTopicMessageIds(
  index: ReadonlyMap<string, readonly MessageId[]>,
  streamId: string,
  topicKey: string,
): readonly MessageId[] {
  return index.get(streamTopicCompositeKey(streamId, topicKey)) ?? [];
}

/** All message ids located in any topic of the given stream. */
export function collectMessageIdsForStream(
  index: ReadonlyMap<string, readonly MessageId[]>,
  streamId: string,
): MessageId[] {
  const prefix = `${streamId}\t`;
  const ids: MessageId[] = [];
  for (const [key, list] of index) {
    if (key.startsWith(prefix)) {
      for (const messageId of list) {
        ids.push(messageId);
      }
    }
  }
  return ids;
}
