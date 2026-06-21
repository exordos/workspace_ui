import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import type { MessageId } from "~/shared/lib/message-id.lib";

/** Latest known message id from in-memory sidebar state (streams, DMs, location index). */
export function getInMemoryLatestMessageId(): MessageId | null {
  const state = useChatListStore.getState();
  let latest: MessageId | null = null;

  const consider = (id: MessageId | null | undefined): void => {
    if (id == null) return;
    latest = id;
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

  return latest;
}

export function maxMessageId(a: MessageId | null, b: MessageId | null): MessageId | null {
  if (a == null) return b;
  if (b == null) return a;
  return b;
}
