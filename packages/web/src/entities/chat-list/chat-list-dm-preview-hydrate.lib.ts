/**
 * Hydrates DM sidebar previews from register `recent_private_conversations` metadata.
 *
 * Uses GET /messages `message_ids` for one batch request per chunk instead of loading DM history.
 */
import {
  summarizeRecentPrivateConversationsForTrace,
  traceDmPreviewHydrate,
} from "~/entities/chat-list/chat-list-dm-preview-hydrate-trace.lib";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import type { ChatListDmMetadataRow } from "~/entities/chat-list/chat-list.model.types";
import { useUsersStore } from "~/entities/user/user.model";
import { fetchMessagesByIds } from "~/shared/api/zulip-messages";
import type { ZulipRecentPrivateConversation } from "~/shared/api/zulip.types";
import { upsertDmIndexFromMessages } from "~/shared/lib/dm-index";
import { logChatListFlow } from "~/shared/lib/message-flow-debug.lib";

function addPositiveMessageId(ids: Set<number>, messageId: number | null | undefined): void {
  if (messageId != null && Number.isInteger(messageId) && messageId > 0) {
    ids.add(messageId);
  }
}

export function collectLastMessageIdsFromRecentPrivateConversations(
  conversations: Record<string, ZulipRecentPrivateConversation> | undefined,
  metadataRows?: readonly ChatListDmMetadataRow[],
): number[] {
  const ids = new Set<number>();
  if (conversations != null) {
    for (const conversation of Object.values(conversations)) {
      addPositiveMessageId(ids, conversation.max_message_id);
    }
  }
  for (const row of metadataRows ?? []) {
    addPositiveMessageId(ids, row.lastMessageId);
  }
  return [...ids];
}

export interface HydrateDmSidebarPreviewsOptions {
  conversations: Record<string, ZulipRecentPrivateConversation> | undefined;
  currentUserId: number | null;
  metadataRows?: readonly ChatListDmMetadataRow[];
  instanceId?: string;
  cancelled?: () => boolean;
}

/** Loads last DM messages from register metadata and merges them into the chat list store. */
export async function hydrateDmSidebarPreviewsFromRecentConversations(
  options: HydrateDmSidebarPreviewsOptions,
): Promise<void> {
  traceDmPreviewHydrate("hydrate:start", {
    instanceId: options.instanceId ?? null,
    currentUserId: options.currentUserId,
    metadataRowCount: options.metadataRows?.length ?? 0,
    conversations: summarizeRecentPrivateConversationsForTrace(options.conversations),
    cancelled: options.cancelled?.() ?? false,
  });

  const messageIds = collectLastMessageIdsFromRecentPrivateConversations(
    options.conversations,
    options.metadataRows,
  );

  traceDmPreviewHydrate("hydrate:collectedMessageIds", {
    messageIdCount: messageIds.length,
    messageIdSample: messageIds.slice(0, 12),
  });

  if (messageIds.length === 0) {
    logChatListFlow("chatList: skip DM preview hydrate (no last message ids)", {
      hasConversations: options.conversations != null,
      metadataRowCount: options.metadataRows?.length ?? 0,
    });
    traceDmPreviewHydrate("hydrate:skip", { reason: "no_message_ids" });
    return;
  }
  if (options.currentUserId == null) {
    logChatListFlow("chatList: skip DM preview hydrate (currentUserId missing)", {
      messageIdCount: messageIds.length,
    });
    traceDmPreviewHydrate("hydrate:skip", {
      reason: "no_current_user_id",
      messageIdCount: messageIds.length,
    });
    return;
  }

  logChatListFlow("chatList: hydrate DM previews from recent_private_conversations", {
    messageIdCount: messageIds.length,
    currentUserId: options.currentUserId,
  });

  traceDmPreviewHydrate("hydrate:fetchMessagesByIds", { messageIdCount: messageIds.length });

  let messages: Awaited<ReturnType<typeof fetchMessagesByIds>>;
  try {
    messages = await fetchMessagesByIds(messageIds);
  } catch (error) {
    traceDmPreviewHydrate("hydrate:fetchFailed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  traceDmPreviewHydrate("hydrate:fetchDone", {
    requestedCount: messageIds.length,
    fetchedCount: messages.length,
    fetchedIdSample: messages.slice(0, 12).map((message) => message.id),
    cancelled: options.cancelled?.() ?? false,
  });

  if (options.cancelled?.()) {
    traceDmPreviewHydrate("hydrate:skip", { reason: "cancelled_after_fetch" });
    return;
  }
  if (messages.length === 0) {
    traceDmPreviewHydrate("hydrate:skip", { reason: "empty_fetch_result" });
    return;
  }

  for (const message of messages) {
    useUsersStore.getState().mergeFromMessage(message);
  }
  useChatListStore.getState().addMessages(messages);
  if (options.instanceId != null) {
    upsertDmIndexFromMessages(options.instanceId, messages, options.currentUserId);
  }

  logChatListFlow("chatList: hydrate DM previews applied", {
    fetchedCount: messages.length,
    dmsMapSize: useChatListStore.getState().dmsMap.size,
  });

  traceDmPreviewHydrate("hydrate:applied", {
    fetchedCount: messages.length,
    dmsMapSize: useChatListStore.getState().dmsMap.size,
  });
}
