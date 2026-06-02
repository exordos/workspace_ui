import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useUsersStore } from "~/entities/user/user.model";
import { fetchDirectMessagesPage } from "~/shared/api/zulip-sidebar-preview.lib";
import { upsertDmIndexFromMessages } from "~/shared/lib/dm-index";

function ingestDmBackfillPage(
  instanceId: string,
  initialUserId: number,
  messages: Awaited<ReturnType<typeof fetchDirectMessagesPage>>["messages"],
): { stagnant: boolean; oldestMessageId: number | null } {
  const currentUserId = useChatListStore.getState().currentUserId ?? initialUserId;
  for (const message of messages) {
    useUsersStore.getState().mergeFromMessage(message);
  }
  const dmsBefore = useChatListStore.getState().dmsMap.size;
  useChatListStore.getState().addMessages(messages);
  upsertDmIndexFromMessages(instanceId, messages, currentUserId);
  const stagnant = useChatListStore.getState().dmsMap.size <= dmsBefore;

  let oldestMessageId: number | null = null;
  for (const message of messages) {
    if (oldestMessageId == null || message.id < oldestMessageId) {
      oldestMessageId = message.id;
    }
  }
  return { stagnant, oldestMessageId };
}

export async function runMetadataDmBackfillLoop(options: {
  instanceId: string;
  initialUserId: number;
  maxBatches: number;
  pageSize: number;
  stagnationLimit: number;
  isCancelled: () => boolean;
}): Promise<void> {
  let anchor: number | "newest" = "newest";
  let stagnantBatches = 0;
  for (let batchIndex = 0; batchIndex < options.maxBatches; batchIndex += 1) {
    if (options.isCancelled()) {
      return;
    }
    const page = await fetchDirectMessagesPage(anchor, options.pageSize);
    if (options.isCancelled() || page.messages.length === 0) {
      return;
    }

    const { stagnant, oldestMessageId } = ingestDmBackfillPage(
      options.instanceId,
      options.initialUserId,
      page.messages,
    );
    stagnantBatches = stagnant ? stagnantBatches + 1 : 0;
    if (oldestMessageId == null || oldestMessageId <= 0) {
      break;
    }
    anchor = oldestMessageId;
    if (page.foundOldest || stagnantBatches >= options.stagnationLimit) {
      break;
    }
  }
}
