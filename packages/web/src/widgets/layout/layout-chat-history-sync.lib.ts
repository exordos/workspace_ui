import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import type { LoadDeepHistoryMessagesOptions } from "./layout-chat-history-sync.types";

const DEFAULT_PAGE_SIZE = 5000;
const DEFAULT_MAX_BATCHES = 5;

function mergeUniqueById(messages: readonly ZulipRawMessage[]): ZulipRawMessage[] {
  const seenIds = new Set<number>();
  const uniqueMessages: ZulipRawMessage[] = [];

  for (const message of messages) {
    if (seenIds.has(message.id)) continue;
    seenIds.add(message.id);
    uniqueMessages.push(message);
  }

  return uniqueMessages;
}

/**
 * Loads additional older chat-list history in large batches.
 *
 * The server can return the anchor message in the page; we always drop that overlap
 * and stop when there are no new older messages or when maxBatches is reached.
 */
export async function loadDeepHistoryMessages(
  options: LoadDeepHistoryMessagesOptions,
): Promise<ZulipRawMessage[]> {
  const { initialMessages, fetchOlderMessages } = options;
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const maxBatches = options.maxBatches ?? DEFAULT_MAX_BATCHES;

  let messages = mergeUniqueById(initialMessages);

  for (let batchIndex = 0; batchIndex < maxBatches; batchIndex += 1) {
    const oldestMessage = messages[0];
    if (oldestMessage == null) {
      break;
    }

    const olderBatch = await fetchOlderMessages(oldestMessage.id, pageSize);
    const olderWithoutAnchor = olderBatch.filter((message) => message.id !== oldestMessage.id);

    if (olderWithoutAnchor.length === 0) {
      break;
    }

    messages = mergeUniqueById([...olderWithoutAnchor, ...messages]);

    if (olderWithoutAnchor.length < pageSize) {
      break;
    }
  }

  return messages;
}

export function getNewestMessageId(messages: readonly ZulipRawMessage[]): number | null {
  const lastMessage = messages[messages.length - 1];
  return lastMessage?.id ?? null;
}
