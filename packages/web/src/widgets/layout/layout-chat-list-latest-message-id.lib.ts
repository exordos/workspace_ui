import { useChatListStore } from "~/entities/chat-list/chat-list.model";

/** Max known message id from in-memory sidebar state (streams, DMs, location index). */
export function getInMemoryLatestMessageId(): number | null {
  const state = useChatListStore.getState();
  let max: number | null = null;

  const consider = (id: number | null | undefined): void => {
    if (id == null || !Number.isInteger(id) || id <= 0) return;
    if (max == null || id > max) {
      max = id;
    }
  };

  for (const stream of state.streamsMap.values()) {
    for (const topic of stream.topics.values()) {
      consider(topic.lastMessageId);
    }
  }
  for (const dm of state.dmsMap.values()) {
    consider(dm.lastMessageId);
  }
  for (const messageId of state.messageIdToLocation.keys()) {
    consider(messageId);
  }

  return max;
}

export function maxMessageId(a: number | null, b: number | null): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return Math.max(a, b);
}
