import type { MockMessage } from "~/shared/api/messenger.types";
import { messageSenderGroupKey } from "~/shared/lib/message-author.lib";
import { normalizeStreamTopicForMessageCache } from "~/shared/lib/message-cache-keys.lib";

function messageGroupKey(message: MockMessage): string {
  const topicKey =
    message.stream_uuid != null
      ? normalizeStreamTopicForMessageCache(message.topic_uuid ?? message.subject ?? "")
      : "";
  return `${messageSenderGroupKey(message)}:${topicKey}`;
}

/** Splits the message array into groups of consecutive messages from the same sender. */
export function getSenderGroups(items: MockMessage[]): MockMessage[][] {
  const result: MockMessage[][] = [];
  for (const msg of items) {
    const last = result[result.length - 1];
    if (last?.[0] != null && messageGroupKey(last[0]) === messageGroupKey(msg)) {
      last.push(msg);
    } else {
      result.push([msg]);
    }
  }
  return result;
}
